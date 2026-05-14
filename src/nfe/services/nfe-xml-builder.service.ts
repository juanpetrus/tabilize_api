import { BadRequestException, Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  AmbienteSefaz,
  Crt,
  IndicadorIeDestinatario,
  MercadoriaOrigem,
  NfeFinalidade,
  NfeModFrete,
  NfeTipoOperacao,
} from '../../../generated/prisma/enums.js';
import { UF_TO_CUF } from '../helpers/nfe-chave.helper.js';

// ─── Tipos derivados do Prisma ────────────────────────────────────────────

export type NfeWithRelations = Prisma.NfeGetPayload<{
  include: {
    customer: true;
    itens: { include: { product: true } };
    pagamentos: true;
  };
}>;

export type CompanyWithFiscal = Prisma.CompanyGetPayload<{
  include: {
    fiscalProfile: true;
    fiscalAddress: true;
    nfeConfig: true;
  };
}>;

// Aliases para itens / pagamentos
type NfeItemWithProduct = NfeWithRelations['itens'][number];

// ─── Mapas de enums → códigos SEFAZ ───────────────────────────────────────

const CRT_TO_CODE: Record<Crt, string> = {
  SIMPLES_NACIONAL: '1',
  SIMPLES_NACIONAL_EXCESSO_SUBLIMITE: '2',
  REGIME_NORMAL: '3',
  MEI: '4',
};

const FINALIDADE_TO_CODE: Record<NfeFinalidade, string> = {
  NORMAL: '1',
  COMPLEMENTAR: '2',
  AJUSTE: '3',
  DEVOLUCAO: '4',
};

const TIPO_OP_TO_CODE: Record<NfeTipoOperacao, string> = {
  ENTRADA: '0',
  SAIDA: '1',
};

const MOD_FRETE_TO_CODE: Record<NfeModFrete, string> = {
  POR_CONTA_EMITENTE: '0',
  POR_CONTA_DESTINATARIO: '1',
  POR_CONTA_TERCEIROS: '2',
  TRANSPORTE_PROPRIO_EMITENTE: '3',
  TRANSPORTE_PROPRIO_DESTINATARIO: '4',
  SEM_TRANSPORTE: '9',
};

const ORIGEM_TO_CODE: Record<MercadoriaOrigem, string> = {
  NACIONAL: '0',
  ESTRANGEIRA_IMPORTACAO_DIRETA: '1',
  ESTRANGEIRA_MERCADO_INTERNO: '2',
  NACIONAL_CI_SUPERIOR_40: '3',
  NACIONAL_PPB: '4',
  NACIONAL_CI_INFERIOR_40: '5',
  ESTRANGEIRA_IMP_DIRETA_SEM_SIMILAR: '6',
  ESTRANGEIRA_MERCADO_INTERNO_SEM_SIMILAR: '7',
  NACIONAL_CI_SUPERIOR_70: '8',
};

const IND_IE_TO_CODE: Record<IndicadorIeDestinatario, string> = {
  CONTRIBUINTE_ICMS: '1',
  ISENTO: '2',
  NAO_CONTRIBUINTE: '9',
};

// CSTs/CSOSNs suportados nesta fase (caso geral)
const CST_ICMS_SUPORTADOS = new Set(['00', '40', '41']);
const CSOSN_SUPORTADOS = new Set(['102', '400', '900']);
const CST_PISCOFINS_SUPORTADOS = new Set(['01', '07', '49']);

// ─── Helpers de formatação ────────────────────────────────────────────────

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return value.toNumber();
}

function fmt2(value: Prisma.Decimal | number | null | undefined): string {
  return toNumber(value).toFixed(2);
}

function fmt4(value: Prisma.Decimal | number | null | undefined): string {
  return toNumber(value).toFixed(4);
}

function fmtAliquota(
  value: Prisma.Decimal | number | null | undefined,
): string {
  return toNumber(value).toFixed(2);
}

function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Formata Date em string ISO com timezone -03:00 (horário oficial Brasília).
 * Formato exigido pelo SEFAZ: YYYY-MM-DDTHH:mm:ss-03:00
 */
function formatDhEmi(date: Date): string {
  // Trabalho em UTC e desloco manualmente -3h para representação local em Brasília.
  const offsetMs = -3 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  const yyyy = local.getUTCFullYear();
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mi = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = String(local.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}-03:00`;
}

@Injectable()
export class NfeXmlBuilderService {
  build(
    nfe: NfeWithRelations,
    company: CompanyWithFiscal,
    chave: string,
    cNF: string,
    dhEmi: Date,
  ): string {
    const fiscalProfile = company.fiscalProfile;
    const fiscalAddress = company.fiscalAddress;
    const nfeConfig = company.nfeConfig;

    if (!fiscalProfile || !fiscalAddress || !nfeConfig) {
      throw new BadRequestException(
        'Empresa sem perfil fiscal, endereço fiscal ou configuração NF-e',
      );
    }
    if (!fiscalProfile.crt) {
      throw new BadRequestException('CRT (regime tributário) não definido');
    }
    if (!fiscalAddress.uf || !fiscalAddress.codIbgeMunicipio) {
      throw new BadRequestException(
        'Endereço fiscal incompleto (UF/município)',
      );
    }
    if (!company.cnpj) {
      throw new BadRequestException('Empresa sem CNPJ — emissão exige CNPJ');
    }
    if (nfe.numero == null) {
      throw new BadRequestException('NF-e sem número atribuído');
    }

    const cUF = UF_TO_CUF[fiscalAddress.uf];
    if (!cUF) {
      throw new BadRequestException(
        `UF do emitente inválida: ${fiscalAddress.uf}`,
      );
    }

    const cDV = chave.slice(-1);
    const tpAmb = nfeConfig.ambiente === AmbienteSefaz.PRODUCAO ? '1' : '2';
    const finNFe = FINALIDADE_TO_CODE[nfe.finalidade];
    const tpNF = TIPO_OP_TO_CODE[nfe.tipoOperacao];
    const crtCode = CRT_TO_CODE[fiscalProfile.crt];

    // idDest: comparação UF emitente x destinatário
    const ufEmitente = fiscalAddress.uf;
    const ufDestinatario = nfe.customer.uf ?? ufEmitente;
    const codPaisDest = nfe.customer.codPais ?? '1058';
    let idDest: string;
    if (codPaisDest !== '1058') {
      idDest = '3';
    } else if (ufDestinatario === ufEmitente) {
      idDest = '1';
    } else {
      idDest = '2';
    }

    const indPres = nfe.indicadorPresenca ?? '9';

    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('NFe', {
      xmlns: 'http://www.portalfiscal.inf.br/nfe',
    });

    const infNFe = doc.ele('infNFe', {
      Id: `NFe${chave}`,
      versao: '4.00',
    });

    // ─── <ide> ─────────────────────────────────────────────────────────
    const ide = infNFe.ele('ide');
    ide.ele('cUF').txt(cUF);
    ide.ele('cNF').txt(cNF);
    ide.ele('natOp').txt(truncate(nfe.naturezaOperacao, 60));
    ide.ele('mod').txt('55');
    ide.ele('serie').txt(String(Number(nfe.serie)));
    ide.ele('nNF').txt(String(nfe.numero));
    ide.ele('dhEmi').txt(formatDhEmi(dhEmi));
    ide.ele('tpNF').txt(tpNF);
    ide.ele('idDest').txt(idDest);
    ide.ele('cMunFG').txt(fiscalAddress.codIbgeMunicipio);
    ide.ele('tpImp').txt('1');
    ide.ele('tpEmis').txt('1');
    ide.ele('cDV').txt(cDV);
    ide.ele('tpAmb').txt(tpAmb);
    ide.ele('finNFe').txt(finNFe);
    // TODO: detectar indFinal a partir do destinatário. Por ora: 1 (consumidor final).
    ide.ele('indFinal').txt('1');
    ide.ele('indPres').txt(indPres);
    ide.ele('procEmi').txt('0');
    ide.ele('verProc').txt('tabilize-1.0');

    // ─── <emit> ────────────────────────────────────────────────────────
    const emit = infNFe.ele('emit');
    emit.ele('CNPJ').txt(onlyDigits(company.cnpj));
    emit.ele('xNome').txt(truncate(company.name, 60));
    if (fiscalProfile.nomeFantasia) {
      emit.ele('xFant').txt(truncate(fiscalProfile.nomeFantasia, 60));
    }

    const enderEmit = emit.ele('enderEmit');
    enderEmit.ele('xLgr').txt(truncate(fiscalAddress.logradouro ?? '', 60));
    enderEmit.ele('nro').txt(truncate(fiscalAddress.numero ?? 'SN', 60));
    if (fiscalAddress.complemento) {
      enderEmit.ele('xCpl').txt(truncate(fiscalAddress.complemento, 60));
    }
    enderEmit.ele('xBairro').txt(truncate(fiscalAddress.bairro ?? '', 60));
    enderEmit.ele('cMun').txt(fiscalAddress.codIbgeMunicipio);
    enderEmit.ele('xMun').txt(truncate(fiscalAddress.municipio ?? '', 60));
    enderEmit.ele('UF').txt(fiscalAddress.uf);
    enderEmit.ele('CEP').txt(onlyDigits(fiscalAddress.cep));
    enderEmit.ele('cPais').txt(fiscalAddress.codPais ?? '1058');
    enderEmit.ele('xPais').txt(fiscalAddress.pais ?? 'BRASIL');
    const phoneEmit = onlyDigits(company.phone);
    if (phoneEmit.length >= 6) {
      enderEmit.ele('fone').txt(phoneEmit);
    }

    emit.ele('IE').txt(fiscalProfile.inscricaoEstadual ?? 'ISENTO');
    if (fiscalProfile.inscricaoEstadualST) {
      emit.ele('IEST').txt(fiscalProfile.inscricaoEstadualST);
    }
    if (fiscalProfile.inscricaoMunicipal) {
      emit.ele('IM').txt(fiscalProfile.inscricaoMunicipal);
    }
    if (fiscalProfile.cnaePrincipal) {
      const cnae = onlyDigits(fiscalProfile.cnaePrincipal);
      if (cnae.length === 7) {
        emit.ele('CNAE').txt(cnae);
      }
    }
    emit.ele('CRT').txt(crtCode);

    // ─── <dest> ────────────────────────────────────────────────────────
    const dest = infNFe.ele('dest');
    const docDest = onlyDigits(nfe.customer.cpfCnpj);
    if (nfe.customer.tipoPessoa === 'PJ') {
      dest.ele('CNPJ').txt(docDest);
    } else {
      dest.ele('CPF').txt(docDest);
    }
    // Em ambiente de homologação a SEFAZ exige xNome = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    const xNomeDest =
      tpAmb === '2'
        ? 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
        : truncate(nfe.customer.name, 60);
    dest.ele('xNome').txt(xNomeDest);

    const enderDest = dest.ele('enderDest');
    enderDest.ele('xLgr').txt(truncate(nfe.customer.logradouro ?? '', 60));
    enderDest.ele('nro').txt(truncate(nfe.customer.numero ?? 'SN', 60));
    if (nfe.customer.complemento) {
      enderDest.ele('xCpl').txt(truncate(nfe.customer.complemento, 60));
    }
    enderDest.ele('xBairro').txt(truncate(nfe.customer.bairro ?? '', 60));
    enderDest.ele('cMun').txt(nfe.customer.codIbgeMunicipio ?? '');
    enderDest.ele('xMun').txt(truncate(nfe.customer.municipio ?? '', 60));
    enderDest.ele('UF').txt(nfe.customer.uf ?? '');
    enderDest.ele('CEP').txt(onlyDigits(nfe.customer.cep));
    enderDest.ele('cPais').txt(nfe.customer.codPais ?? '1058');
    enderDest.ele('xPais').txt(nfe.customer.pais ?? 'BRASIL');
    const phoneDest = onlyDigits(nfe.customer.phone);
    if (phoneDest.length >= 6) {
      enderDest.ele('fone').txt(phoneDest);
    }

    const indIE = IND_IE_TO_CODE[nfe.customer.indicadorIe];
    dest.ele('indIEDest').txt(indIE);
    if (
      nfe.customer.indicadorIe === IndicadorIeDestinatario.CONTRIBUINTE_ICMS &&
      nfe.customer.inscricaoEstadual
    ) {
      dest.ele('IE').txt(nfe.customer.inscricaoEstadual);
    }
    if (nfe.customer.email) {
      dest.ele('email').txt(truncate(nfe.customer.email, 60));
    }

    // ─── <det> ─ um por item ──────────────────────────────────────────
    for (const item of nfe.itens) {
      this.buildDet(infNFe, item, fiscalProfile.crt, tpAmb);
    }

    // ─── <total> ──────────────────────────────────────────────────────
    const total = infNFe.ele('total');
    const icmsTot = total.ele('ICMSTot');
    const somaBcIcms = nfe.itens.reduce(
      (acc, it) => acc + toNumber(it.baseCalcIcms),
      0,
    );
    icmsTot.ele('vBC').txt(fmt2(somaBcIcms));
    icmsTot.ele('vICMS').txt(fmt2(nfe.totalIcms));
    icmsTot.ele('vICMSDeson').txt('0.00');
    icmsTot.ele('vFCP').txt('0.00');
    icmsTot.ele('vBCST').txt('0.00');
    icmsTot.ele('vST').txt(fmt2(nfe.totalIcmsSt));
    icmsTot.ele('vFCPST').txt('0.00');
    icmsTot.ele('vFCPSTRet').txt('0.00');
    icmsTot.ele('vProd').txt(fmt2(nfe.totalProdutos));
    icmsTot.ele('vFrete').txt(fmt2(nfe.totalFrete));
    icmsTot.ele('vSeg').txt(fmt2(nfe.totalSeguro));
    icmsTot.ele('vDesc').txt(fmt2(nfe.totalDesconto));
    icmsTot.ele('vII').txt('0.00');
    icmsTot.ele('vIPI').txt(fmt2(nfe.totalIpi));
    icmsTot.ele('vIPIDevol').txt('0.00');
    icmsTot.ele('vPIS').txt(fmt2(nfe.totalPis));
    icmsTot.ele('vCOFINS').txt(fmt2(nfe.totalCofins));
    icmsTot.ele('vOutro').txt(fmt2(nfe.totalOutros));
    icmsTot.ele('vNF').txt(fmt2(nfe.totalNota));

    // ─── <transp> ─────────────────────────────────────────────────────
    const transp = infNFe.ele('transp');
    transp.ele('modFrete').txt(MOD_FRETE_TO_CODE[nfe.modFrete]);

    // ─── <pag> ────────────────────────────────────────────────────────
    const pag = infNFe.ele('pag');
    if (nfe.pagamentos.length === 0) {
      const detPag = pag.ele('detPag');
      detPag.ele('tPag').txt('90');
      detPag.ele('vPag').txt('0.00');
    } else {
      for (const p of nfe.pagamentos) {
        const detPag = pag.ele('detPag');
        detPag.ele('tPag').txt(p.formaPagamento);
        detPag.ele('vPag').txt(fmt2(p.valor));
      }
    }

    // ─── <infAdic> ────────────────────────────────────────────────────
    if (nfe.observacoesFiscais || nfe.observacoesContrib) {
      const infAdic = infNFe.ele('infAdic');
      if (nfe.observacoesFiscais) {
        infAdic.ele('infAdFisco').txt(truncate(nfe.observacoesFiscais, 2000));
      }
      if (nfe.observacoesContrib) {
        infAdic.ele('infCpl').txt(truncate(nfe.observacoesContrib, 5000));
      }
    }

    return doc.end({ headless: true });
  }

  // ─── Item <det> ─────────────────────────────────────────────────────

  private buildDet(
    parent: XMLBuilder,
    item: NfeItemWithProduct,
    crt: Crt,
    tpAmb: string,
  ): void {
    const det = parent.ele('det', { nItem: String(item.ordem) });
    const prod = det.ele('prod');
    const product = item.product;

    prod.ele('cProd').txt(product.codigoInterno);
    prod.ele('cEAN').txt(product.codigoBarras ?? 'SEM GTIN');
    // Em homologação, exige-se descrição fixa "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"
    const xProd =
      tpAmb === '2'
        ? 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL'
        : truncate(product.descricao, 120);
    prod.ele('xProd').txt(xProd);
    prod.ele('NCM').txt(product.ncmCodigo ?? '00000000');
    prod.ele('CFOP').txt(item.cfop);
    prod.ele('uCom').txt(item.unidade);
    prod.ele('qCom').txt(fmt4(item.quantidade));
    prod.ele('vUnCom').txt(fmt4(item.valorUnitario));
    const vProd = toNumber(item.quantidade) * toNumber(item.valorUnitario);
    prod.ele('vProd').txt(fmt2(vProd));
    prod.ele('cEANTrib').txt(product.codigoBarras ?? 'SEM GTIN');
    prod.ele('uTrib').txt(item.unidade);
    prod.ele('qTrib').txt(fmt4(item.quantidade));
    prod.ele('vUnTrib').txt(fmt4(item.valorUnitario));
    if (toNumber(item.desconto) > 0) {
      prod.ele('vDesc').txt(fmt2(item.desconto));
    }
    prod.ele('indTot').txt('1');

    // ─── <imposto> ────────────────────────────────────────────────────
    const imposto = det.ele('imposto');
    this.buildIcms(imposto, item, crt);
    this.buildPis(imposto, item);
    this.buildCofins(imposto, item);
    // IPI omitido nesta fase — só suportamos não tributado (caso geral SN/Regime).
  }

  // ─── ICMS / ICMSSN ──────────────────────────────────────────────────

  private buildIcms(
    parent: XMLBuilder,
    item: NfeItemWithProduct,
    crt: Crt,
  ): void {
    const orig = ORIGEM_TO_CODE[item.origem];
    const icms = parent.ele('ICMS');

    const isSimples =
      crt === Crt.SIMPLES_NACIONAL ||
      crt === Crt.SIMPLES_NACIONAL_EXCESSO_SUBLIMITE ||
      crt === Crt.MEI;

    const cst = item.cstIcms ?? '';

    if (isSimples) {
      // CSOSN — 3 dígitos
      if (!CSOSN_SUPORTADOS.has(cst)) {
        // TODO: implementar demais CSOSN (101, 103, 201..203, 300, 500, 900 com campos completos).
        throw new BadRequestException(
          `Tributação ${cst} ainda não suportada — em desenvolvimento`,
        );
      }
      if (cst === '102' || cst === '400') {
        const grp = icms.ele(`ICMSSN${cst}`);
        grp.ele('orig').txt(orig);
        grp.ele('CSOSN').txt(cst);
      } else {
        // 900 — bloco mínimo sem benefício (alíquotas zeradas)
        const grp = icms.ele('ICMSSN900');
        grp.ele('orig').txt(orig);
        grp.ele('CSOSN').txt('900');
        grp.ele('modBC').txt('3');
        grp.ele('vBC').txt(fmt2(item.baseCalcIcms));
        grp.ele('pICMS').txt(fmtAliquota(item.aliquotaIcms));
        grp.ele('vICMS').txt(fmt2(item.valorIcms));
        grp.ele('pCredSN').txt('0.00');
        grp.ele('vCredICMSSN').txt('0.00');
      }
    } else {
      // CST — 2 dígitos
      if (!CST_ICMS_SUPORTADOS.has(cst)) {
        // TODO: implementar demais CST (10, 20, 30, 50, 51, 60, 70, 90 — ST, redução BC, drawback).
        throw new BadRequestException(
          `Tributação ${cst} ainda não suportada — em desenvolvimento`,
        );
      }
      if (cst === '00') {
        const grp = icms.ele('ICMS00');
        grp.ele('orig').txt(orig);
        grp.ele('CST').txt('00');
        grp.ele('modBC').txt('3');
        grp.ele('vBC').txt(fmt2(item.baseCalcIcms));
        grp.ele('pICMS').txt(fmtAliquota(item.aliquotaIcms));
        grp.ele('vICMS').txt(fmt2(item.valorIcms));
      } else if (cst === '40' || cst === '41') {
        const grp = icms.ele(`ICMS${cst}`);
        grp.ele('orig').txt(orig);
        grp.ele('CST').txt(cst);
      }
    }
  }

  // ─── PIS ─────────────────────────────────────────────────────────────

  private buildPis(parent: XMLBuilder, item: NfeItemWithProduct): void {
    const cst = item.cstPis ?? '';
    if (!CST_PISCOFINS_SUPORTADOS.has(cst)) {
      // TODO: implementar demais CSTs PIS (02, 03, 04, 05, 06, 08, 09, 50..99 com campos completos).
      throw new BadRequestException(
        `Tributação ${cst} ainda não suportada — em desenvolvimento`,
      );
    }
    const pis = parent.ele('PIS');
    if (cst === '01') {
      const grp = pis.ele('PISAliq');
      grp.ele('CST').txt('01');
      grp.ele('vBC').txt(fmt2(item.baseCalcPis));
      grp.ele('pPIS').txt(fmtAliquota(item.aliquotaPis));
      grp.ele('vPIS').txt(fmt2(item.valorPis));
    } else if (cst === '07') {
      const grp = pis.ele('PISNT');
      grp.ele('CST').txt('07');
    } else {
      // '49'
      const grp = pis.ele('PISOutr');
      grp.ele('CST').txt('49');
      grp.ele('vBC').txt(fmt2(item.baseCalcPis));
      grp.ele('pPIS').txt(fmtAliquota(item.aliquotaPis));
      grp.ele('vPIS').txt(fmt2(item.valorPis));
    }
  }

  // ─── COFINS ──────────────────────────────────────────────────────────

  private buildCofins(parent: XMLBuilder, item: NfeItemWithProduct): void {
    const cst = item.cstCofins ?? '';
    if (!CST_PISCOFINS_SUPORTADOS.has(cst)) {
      // TODO: implementar demais CSTs COFINS (02..09, 50..99 com campos completos).
      throw new BadRequestException(
        `Tributação ${cst} ainda não suportada — em desenvolvimento`,
      );
    }
    const cofins = parent.ele('COFINS');
    if (cst === '01') {
      const grp = cofins.ele('COFINSAliq');
      grp.ele('CST').txt('01');
      grp.ele('vBC').txt(fmt2(item.baseCalcCofins));
      grp.ele('pCOFINS').txt(fmtAliquota(item.aliquotaCofins));
      grp.ele('vCOFINS').txt(fmt2(item.valorCofins));
    } else if (cst === '07') {
      const grp = cofins.ele('COFINSNT');
      grp.ele('CST').txt('07');
    } else {
      // '49'
      const grp = cofins.ele('COFINSOutr');
      grp.ele('CST').txt('49');
      grp.ele('vBC').txt(fmt2(item.baseCalcCofins));
      grp.ele('pCOFINS').txt(fmtAliquota(item.aliquotaCofins));
      grp.ele('vCOFINS').txt(fmt2(item.valorCofins));
    }
  }
}
