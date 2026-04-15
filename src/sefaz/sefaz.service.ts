import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import https from 'https';
import { parseStringPromise } from 'xml2js';
import * as forge from 'node-forge';
import { gunzip } from 'zlib';
import { promisify } from 'util';
import { chromium } from 'playwright';
import { PrismaService } from '../database/index.js';
import { CertificatesService } from '../certificates/certificates.service.js';

const gunzipAsync = promisify(gunzip);

const SEFAZ_URL = {
  homolog: 'https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  prod: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
};

const ENV = process.env['NODE_ENV'] === 'production' ? 'prod' : 'homolog';
const RATE_LIMIT_MS = 60 * 60 * 1000;

interface DocZip {
  _: string;
  $: { NSU: string; schema: string };
}

@Injectable()
export class SefazService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly certificates: CertificatesService,
  ) {}

  // ─── Sincronização ────────────────────────────────────────────────────────

  async fetchNfe(teamId: string, companyId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member) throw new BadRequestException('Você não é membro dessa equipe');

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.cnpj) throw new BadRequestException('Empresa sem CNPJ cadastrado');

    if (company.sefazLastSync) {
      const elapsed = Date.now() - company.sefazLastSync.getTime();
      if (elapsed < RATE_LIMIT_MS) {
        const minutosRestantes = Math.ceil((RATE_LIMIT_MS - elapsed) / 60000);
        throw new BadRequestException(`Aguarde ${minutosRestantes} minuto(s) antes de consultar novamente`);
      }
    }

    const cnpj = company.cnpj.replace(/\D/g, '');
    const ultNsu = company.sefazUltNsu ?? '000000000000000';
    const { fileBuffer, password } = await this.certificates.getForIntegration(companyId);

    const tpAmb = ENV === 'prod' ? '1' : '2';
    const httpsAgent = this.buildHttpsAgent(fileBuffer, password);
    const soapBody = this.buildSoapRequest(cnpj, ultNsu, tpAmb);

    let responseXml: string;
    try {
      const response = await axios.post<string>(SEFAZ_URL[ENV], soapBody, {
        httpsAgent,
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"',
        },
        timeout: 30000,
      });
      responseXml = response.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao conectar na SEFAZ';
      throw new BadRequestException(`Erro na comunicação com SEFAZ: ${msg}`);
    }

    const { cStat, xMotivo, ultNsu: novoUltNsu, maxNsu, documentos } = await this.parseResponse(responseXml);

    await this.prisma.company.update({
      where: { id: companyId },
      data: { sefazUltNsu: novoUltNsu, sefazLastSync: new Date() },
    });

    let nfes = 0;
    let eventos = 0;
    if (documentos.length > 0) {
      const result = await this.saveDocuments(companyId, cnpj, documentos);
      nfes = result.nfes;
      eventos = result.eventos;
    }

    return {
      ambiente: ENV === 'prod' ? 'producao' : 'homologacao',
      status: { codigo: cStat, motivo: xMotivo },
      ultNsu: novoUltNsu,
      maxNsu,
      sincronizado: novoUltNsu === maxNsu,
      total: documentos.length,
      salvos: { nfes, eventos },
    };
  }

  // ─── Listagem ─────────────────────────────────────────────────────────────

  async listNFes(
    teamId: string,
    companyId: string,
    userId: string,
    filters: {
      tipo?: string;
      status?: string;
      modelo?: string;
      dataInicio?: string;
      dataFim?: string;
      page?: number;
      limit?: number;
    },
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where = {
      companyId,
      ...(filters.tipo && { tipo: filters.tipo }),
      ...(filters.status && { status: filters.status }),
      ...(filters.modelo && { modelo: filters.modelo }),
      ...((filters.dataInicio || filters.dataFim) && {
        dataEmissao: {
          ...(filters.dataInicio && { gte: new Date(filters.dataInicio) }),
          ...(filters.dataFim && { lte: new Date(filters.dataFim) }),
        },
      }),
    };

    const [total, nfes] = await Promise.all([
      this.prisma.sefazNFe.count({ where }),
      this.prisma.sefazNFe.findMany({
        where,
        select: {
          id: true, nsu: true, chave: true, tipo: true, status: true, modelo: true,
          emitenteCnpj: true, emitenteNome: true, destinCnpj: true, destinNome: true,
          valor: true, serie: true, numero: true, dataEmissao: true, temXmlCompleto: true,
          manifestacao: true,
          _count: { select: { eventos: true } },
        },
        orderBy: { dataEmissao: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { total, page, limit, nfes };
  }

  async getNFe(teamId: string, companyId: string, userId: string, nfeId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const nfe = await this.prisma.sefazNFe.findFirst({
      where: { id: nfeId, companyId },
      include: {
        eventos: {
          orderBy: { dataEvento: 'asc' },
          select: {
            id: true, nsu: true, tpEvento: true, xEvento: true,
            dataEvento: true, protocolo: true, schema: true,
          },
        },
      },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    // Se tem XML completo, parseia e retorna dados detalhados
    if (nfe.temXmlCompleto && nfe.xmlGzip) {
      const compressed = Buffer.from(nfe.xmlGzip, 'base64');
      const xmlBuffer = await gunzipAsync(compressed);
      const parsed = await parseStringPromise(xmlBuffer.toString('utf-8'), { explicitArray: false });
      const detalhes = this.parseNFeDetails(parsed);
      const { xmlGzip: _, ...nfeSemXml } = nfe;
      return { ...nfeSemXml, detalhes };
    }

    const { xmlGzip: _, ...nfeSemXml } = nfe;
    return nfeSemXml;
  }

  async getNFeXml(teamId: string, companyId: string, userId: string, nfeId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const nfe = await this.prisma.sefazNFe.findFirst({
      where: { id: nfeId, companyId },
      select: { xmlGzip: true, temXmlCompleto: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (!nfe.temXmlCompleto || !nfe.xmlGzip) {
      throw new BadRequestException('XML completo não disponível para esta NF-e');
    }

    const compressed = Buffer.from(nfe.xmlGzip, 'base64');
    const xml = await gunzipAsync(compressed);
    return { xml: xml.toString('utf-8') };
  }

  async getDanfe(teamId: string, companyId: string, userId: string, nfeId: string): Promise<Buffer> {
    await this.ensureAccess(teamId, companyId, userId);

    const nfe = await this.prisma.sefazNFe.findFirst({
      where: { id: nfeId, companyId },
      select: { xmlGzip: true, temXmlCompleto: true, chave: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (!nfe.temXmlCompleto || !nfe.xmlGzip) {
      throw new BadRequestException('XML completo não disponível — consulte a NF-e primeiro');
    }

    const compressed = Buffer.from(nfe.xmlGzip, 'base64');
    const xmlBuffer = await gunzipAsync(compressed);
    const parsed = await parseStringPromise(xmlBuffer.toString('utf-8'), { explicitArray: false });
    const detalhes = this.parseNFeDetails(parsed);

    const html = this.buildDanfeHtml(detalhes, nfe.chave ?? '');

    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }

  private buildDanfeHtml(d: ReturnType<typeof this.parseNFeDetails>, chave: string): string {
    const fmt = (v: number | null | undefined) =>
      v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-';

    const fmtDoc = (doc: string | null | undefined) => {
      if (!doc) return '-';
      if (doc.length === 14) return doc.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
      if (doc.length === 11) return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      return doc;
    };

    const chaveFormatada = chave.replace(/(\d{4})/g, '$1 ').trim();

    const itensHtml = d.itens.map((it, i) => `
      <tr class="${i % 2 === 0 ? 'par' : 'impar'}">
        <td>${it.item ?? i + 1}</td>
        <td>${it.codigo ?? '-'}</td>
        <td>${it.descricao ?? '-'}</td>
        <td>${it.ncm ?? '-'}</td>
        <td>${it.cfop ?? '-'}</td>
        <td>${it.unidade ?? '-'}</td>
        <td class="num">${fmt(it.quantidade)}</td>
        <td class="num">${fmt(it.valorUnitario)}</td>
        <td class="num">${fmt(it.valorTotal)}</td>
      </tr>`).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; font-size: 8pt; color: #000; padding: 8mm; }
  .danfe { border: 1px solid #000; }
  .header { display: flex; border-bottom: 1px solid #000; }
  .header-logo { width: 30%; padding: 4px; border-right: 1px solid #000; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .header-logo h2 { font-size: 10pt; font-weight: bold; }
  .header-center { width: 40%; padding: 4px; border-right: 1px solid #000; text-align: center; display: flex; flex-direction: column; justify-content: center; }
  .header-center h1 { font-size: 9pt; font-weight: bold; }
  .header-right { width: 30%; padding: 4px; }
  .section { border-bottom: 1px solid #000; padding: 3px 4px; }
  .section-title { font-size: 6pt; color: #555; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; }
  .row { display: flex; gap: 8px; }
  .field { flex: 1; }
  .field-label { font-size: 6pt; color: #777; }
  .field-value { font-size: 8pt; font-weight: bold; }
  .chave { font-size: 7pt; font-family: monospace; word-break: break-all; background: #f5f5f5; padding: 2px 4px; border: 1px solid #ccc; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 7pt; }
  table th { background: #e0e0e0; border: 1px solid #ccc; padding: 2px 3px; text-align: left; font-size: 6.5pt; }
  table td { border: 1px solid #ccc; padding: 2px 3px; }
  .par { background: #fafafa; }
  .num { text-align: right; }
  .totais { display: flex; justify-content: flex-end; padding: 4px; border-bottom: 1px solid #000; }
  .totais table { width: 50%; }
  .totais td { padding: 1px 4px; }
  .total-final { font-weight: bold; font-size: 9pt; }
  .protocolo { padding: 4px; font-size: 7pt; background: #f0f0f0; text-align: center; }
</style>
</head>
<body>
<div class="danfe">

  <!-- CABEÇALHO -->
  <div class="header">
    <div class="header-logo">
      <h2>${d.emitente.nome ?? '-'}</h2>
      <div style="font-size:7pt">${d.emitente.fantasia ?? ''}</div>
      <div style="font-size:7pt">CNPJ: ${fmtDoc(d.emitente.documento)}</div>
      <div style="font-size:7pt">IE: ${d.emitente.ie ?? '-'}</div>
    </div>
    <div class="header-center">
      <h1>DANFE</h1>
      <div>Documento Auxiliar da Nota Fiscal Eletrônica</div>
      <div style="margin-top:4px; font-size:7pt">Modelo: 55 &nbsp;|&nbsp; Série: ${d.serie ?? '-'} &nbsp;|&nbsp; Número: ${d.numero ?? '-'}</div>
    </div>
    <div class="header-right">
      <div class="field-label">Natureza da Operação</div>
      <div class="field-value">${d.naturezaOperacao ?? '-'}</div>
      <div style="margin-top:4px" class="field-label">Chave de Acesso</div>
      <div class="chave">${chaveFormatada}</div>
    </div>
  </div>

  <!-- DESTINATÁRIO -->
  <div class="section">
    <div class="section-title">Destinatário / Remetente</div>
    <div class="row">
      <div class="field" style="flex:3">
        <div class="field-label">Nome / Razão Social</div>
        <div class="field-value">${d.destinatario.nome ?? '-'}</div>
      </div>
      <div class="field">
        <div class="field-label">CNPJ / CPF</div>
        <div class="field-value">${fmtDoc(d.destinatario.documento)}</div>
      </div>
      <div class="field">
        <div class="field-label">IE</div>
        <div class="field-value">${d.destinatario.ie ?? '-'}</div>
      </div>
    </div>
  </div>

  <!-- ITENS -->
  <div class="section">
    <div class="section-title">Dados dos Produtos / Serviços</div>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Código</th><th>Descrição</th><th>NCM</th>
          <th>CFOP</th><th>Un</th><th>Qtd</th><th>Vl. Unit.</th><th>Vl. Total</th>
        </tr>
      </thead>
      <tbody>${itensHtml}</tbody>
    </table>
  </div>

  <!-- TOTAIS -->
  <div class="totais">
    <table>
      <tr><td>Valor dos Produtos</td><td class="num">R$ ${fmt(d.totais.produtos)}</td></tr>
      <tr><td>Frete</td><td class="num">R$ ${fmt(d.totais.frete)}</td></tr>
      <tr><td>Desconto</td><td class="num">R$ ${fmt(d.totais.desconto)}</td></tr>
      <tr><td>ICMS</td><td class="num">R$ ${fmt(d.totais.icms)}</td></tr>
      <tr><td>IPI</td><td class="num">R$ ${fmt(d.totais.ipi)}</td></tr>
      <tr><td>PIS</td><td class="num">R$ ${fmt(d.totais.pis)}</td></tr>
      <tr><td>COFINS</td><td class="num">R$ ${fmt(d.totais.cofins)}</td></tr>
      <tr class="total-final"><td>VALOR TOTAL DA NOTA</td><td class="num">R$ ${fmt(d.totais.valorNota)}</td></tr>
    </table>
  </div>

  ${d.informacoesAdicionais ? `
  <div class="section">
    <div class="section-title">Informações Adicionais</div>
    <div>${d.informacoesAdicionais}</div>
  </div>` : ''}

  <!-- PROTOCOLO -->
  ${d.protocolo ? `
  <div class="protocolo">
    Protocolo de Autorização: ${d.protocolo.numero ?? '-'} &nbsp;|&nbsp;
    Data: ${d.protocolo.dataAutorizacao ? new Date(String(d.protocolo.dataAutorizacao)).toLocaleString('pt-BR') : '-'} &nbsp;|&nbsp;
    Status: ${d.protocolo.status} - ${d.protocolo.motivo}
  </div>` : ''}

</div>
</body>
</html>`;
  }

  // ─── Processamento interno ────────────────────────────────────────────────

  private async saveDocuments(companyId: string, companyCnpj: string, documentos: DocZip[]) {
    let nfes = 0;
    let eventos = 0;

    for (const doc of documentos) {
      const nsu = doc.$?.NSU;
      const schema = doc.$?.schema ?? '';
      const xmlGzip = doc._;

      let parsed: Record<string, unknown> = {};
      try {
        const compressed = Buffer.from(xmlGzip, 'base64');
        const xmlBuffer = await gunzipAsync(compressed);
        parsed = await parseStringPromise(xmlBuffer.toString('utf-8'), { explicitArray: false });
      } catch { /* salva mesmo sem parse */ }

      if (schema.startsWith('procNFe') || schema.startsWith('resNFe') || schema.startsWith('NFe')) {
        const saved = await this.saveNFe(companyId, companyCnpj, nsu, schema, xmlGzip, parsed);
        if (saved) nfes++;
      } else if (schema.startsWith('resEvento') || schema.startsWith('procEventoNFe')) {
        const saved = await this.saveEvento(companyId, nsu, schema, xmlGzip, parsed);
        if (saved) eventos++;
      }
    }

    return { nfes, eventos };
  }

  private async saveNFe(
    companyId: string,
    companyCnpj: string,
    nsu: string,
    schema: string,
    xmlGzip: string,
    parsed: Record<string, unknown>,
  ) {
    const temXmlCompleto = schema.startsWith('procNFe') || schema.startsWith('NFe');

    const infNFe = this.extractInfNFe(parsed, schema);
    if (!infNFe) return false;

    const ide = infNFe?.['ide'] as Record<string, unknown>;
    const emit = infNFe?.['emit'] as Record<string, unknown>;
    const dest = infNFe?.['dest'] as Record<string, unknown>;
    const total = (infNFe?.['total'] as Record<string, unknown>)?.['ICMSTot'] as Record<string, unknown>;

    const idAttr = (infNFe?.['$'] as Record<string, unknown>)?.['Id'] as string ?? '';
    const chave = idAttr.replace('NFe', '') || ((parsed?.['resNFe'] as Record<string, unknown>)?.['chNFe'] as string) || '';
    if (!chave) return false;

    const emitenteCnpj = (emit?.['CNPJ'] as string) ?? (emit?.['CPF'] as string) ?? null;
    const emitenteNome = (emit?.['xNome'] as string) ?? null;
    const destinCnpj = (dest?.['CNPJ'] as string) ?? (dest?.['CPF'] as string) ?? null;
    const destinNome = (dest?.['xNome'] as string) ?? null;
    const valor = total?.['vNF'] ? parseFloat(total['vNF'] as string) : null;
    const dhEmi = (ide?.['dhEmi'] as string) ?? (ide?.['dEmi'] as string);
    const dataEmissao = dhEmi ? new Date(dhEmi) : null;
    const serie = (ide?.['serie'] as string) ?? null;
    const numero = (ide?.['nNF'] as string) ?? null;
    const modelo = (ide?.['mod'] as string) ?? null;
    const tipo = emitenteCnpj === companyCnpj ? 'EMITIDA' : destinCnpj === companyCnpj ? 'RECEBIDA' : null;

    await this.prisma.sefazNFe.upsert({
      where: { companyId_chave: { companyId, chave } },
      create: {
        companyId, chave, nsu, tipo, modelo, emitenteCnpj, emitenteNome,
        destinCnpj, destinNome, valor, serie, numero, dataEmissao,
        xmlGzip: temXmlCompleto ? xmlGzip : null,
        temXmlCompleto,
      },
      update: {
        nsu, modelo,
        ...(emitenteCnpj && { emitenteCnpj }),
        ...(emitenteNome && { emitenteNome }),
        ...(destinCnpj && { destinCnpj }),
        ...(destinNome && { destinNome }),
        ...(valor !== null && { valor }),
        ...(serie && { serie }),
        ...(numero && { numero }),
        ...(dataEmissao && { dataEmissao }),
        ...(tipo && { tipo }),
        ...(temXmlCompleto && { xmlGzip, temXmlCompleto: true }),
      },
    });

    return true;
  }

  private async saveEvento(
    companyId: string,
    nsu: string,
    schema: string,
    xmlGzip: string,
    parsed: Record<string, unknown>,
  ) {
    const exists = await this.prisma.sefazEvento.findUnique({
      where: { companyId_nsu: { companyId, nsu } },
    });
    if (exists) return false;

    const resEvento =
      (parsed?.['resEvento'] as Record<string, unknown>) ??
      ((parsed?.['procEventoNFe'] as Record<string, unknown>)?.['eventoNFe'] as Record<string, unknown>);

    const chaveNFe = (resEvento?.['chNFe'] as string) ?? '';
    const tpEvento = (resEvento?.['tpEvento'] as string) ?? null;
    const xEvento = (resEvento?.['xEvento'] as string) ?? null;
    const protocolo = (resEvento?.['nProt'] as string) ?? null;
    const dhEvento = (resEvento?.['dhEvento'] as string) ?? (resEvento?.['dhRecbto'] as string);
    const dataEvento = dhEvento ? new Date(dhEvento) : null;

    // Busca NF-e vinculada pela chave (se existir)
    let nfeId: string | null = null;
    if (chaveNFe) {
      const nfe = await this.prisma.sefazNFe.findUnique({
        where: { companyId_chave: { companyId, chave: chaveNFe } },
        select: { id: true },
      });
      nfeId = nfe?.id ?? null;

      // Atualiza campos da nota conforme tipo de evento
      if (nfe) {
        const MANIFESTACOES: Record<string, string> = {
          '210210': 'CIENCIA',
          '210200': 'CONFIRMADA',
          '220200': 'DESCONHECIMENTO',
          '210240': 'NAO_REALIZADA',
        };
        const manifestacao = tpEvento ? MANIFESTACOES[tpEvento] : null;

        await this.prisma.sefazNFe.update({
          where: { id: nfe.id },
          data: {
            ...(tpEvento === '110111' && { status: 'CANCELADA' }),
            ...(manifestacao && { manifestacao }),
          },
        });
      }

      // Se não tem a nota ainda, cria stub para manter histórico
      if (!nfe && chaveNFe) {
        const created = await this.prisma.sefazNFe.create({
          data: {
            companyId, chave: chaveNFe, nsu: null,
            status: tpEvento === '110111' ? 'CANCELADA' : 'AUTORIZADA',
            temXmlCompleto: false,
          },
        });
        nfeId = created.id;
      }
    }

    await this.prisma.sefazEvento.create({
      data: { companyId, nfeId, chaveNFe, nsu, tpEvento, xEvento, dataEvento, protocolo, schema, xmlGzip },
    });

    return true;
  }

  // ─── Parse XML NF-e ──────────────────────────────────────────────────────

  private extractInfNFe(parsed: Record<string, unknown>, schema: string) {
    if (schema.startsWith('procNFe') || schema.startsWith('NFe')) {
      return (
        ((parsed?.['nfeProc'] as Record<string, unknown>)?.['NFe'] as Record<string, unknown>)?.['infNFe'] ??
        ((parsed?.['NFe'] as Record<string, unknown>)?.['infNFe'])
      ) as Record<string, unknown>;
    }
    if (schema.startsWith('resNFe')) {
      return parsed?.['resNFe'] as Record<string, unknown>;
    }
    return null;
  }

  private parseNFeDetails(parsed: Record<string, unknown>) {
    const infNFe = (
      ((parsed?.['nfeProc'] as Record<string, unknown>)?.['NFe'] as Record<string, unknown>)?.['infNFe'] ??
      ((parsed?.['NFe'] as Record<string, unknown>)?.['infNFe'])
    ) as Record<string, unknown>;

    const ide = infNFe?.['ide'] as Record<string, unknown>;
    const emit = infNFe?.['emit'] as Record<string, unknown>;
    const dest = infNFe?.['dest'] as Record<string, unknown>;
    const total = (infNFe?.['total'] as Record<string, unknown>)?.['ICMSTot'] as Record<string, unknown>;
    const transp = infNFe?.['transp'] as Record<string, unknown>;
    const infAdic = infNFe?.['infAdic'] as Record<string, unknown>;
    const protNFe = (parsed?.['nfeProc'] as Record<string, unknown>)?.['protNFe'] as Record<string, unknown>;
    const infProt = protNFe?.['infProt'] as Record<string, unknown>;

    const detRaw = infNFe?.['det'];
    const detArray = Array.isArray(detRaw) ? detRaw : detRaw ? [detRaw] : [];
    const itens = detArray.map((det: Record<string, unknown>) => {
      const prod = det?.['prod'] as Record<string, unknown>;
      return {
        item: (det?.['$'] as Record<string, unknown>)?.['nItem'],
        codigo: prod?.['cProd'],
        descricao: prod?.['xProd'],
        ncm: prod?.['NCM'],
        cfop: prod?.['CFOP'],
        unidade: prod?.['uCom'],
        quantidade: prod?.['qCom'] ? parseFloat(prod['qCom'] as string) : null,
        valorUnitario: prod?.['vUnCom'] ? parseFloat(prod['vUnCom'] as string) : null,
        valorTotal: prod?.['vProd'] ? parseFloat(prod['vProd'] as string) : null,
      };
    });

    return {
      numero: ide?.['nNF'],
      serie: ide?.['serie'],
      naturezaOperacao: ide?.['natOp'],
      emitente: {
        documento: (emit?.['CNPJ'] as string) ?? (emit?.['CPF'] as string) ?? null,
        nome: emit?.['xNome'],
        fantasia: emit?.['xFant'],
        ie: emit?.['IE'],
      },
      destinatario: {
        documento: (dest?.['CNPJ'] as string) ?? (dest?.['CPF'] as string) ?? null,
        nome: dest?.['xNome'],
        ie: dest?.['IE'],
      },
      totais: {
        produtos: total?.['vProd'] ? parseFloat(total['vProd'] as string) : null,
        frete: total?.['vFrete'] ? parseFloat(total['vFrete'] as string) : null,
        desconto: total?.['vDesc'] ? parseFloat(total['vDesc'] as string) : null,
        icms: total?.['vICMS'] ? parseFloat(total['vICMS'] as string) : null,
        ipi: total?.['vIPI'] ? parseFloat(total['vIPI'] as string) : null,
        pis: total?.['vPIS'] ? parseFloat(total['vPIS'] as string) : null,
        cofins: total?.['vCOFINS'] ? parseFloat(total['vCOFINS'] as string) : null,
        valorNota: total?.['vNF'] ? parseFloat(total['vNF'] as string) : null,
      },
      transporte: { modalidade: transp?.['modFrete'] },
      protocolo: infProt ? {
        numero: infProt?.['nProt'],
        dataAutorizacao: infProt?.['dhRecbto'],
        status: infProt?.['cStat'],
        motivo: infProt?.['xMotivo'],
      } : null,
      informacoesAdicionais: (infAdic?.['infCpl'] as string) ?? null,
      itens,
    };
  }

  // ─── Consulta NF-e por chave (consChNFe) ─────────────────────────────────

  async consultarNFe(teamId: string, companyId: string, userId: string, nfeId: string, force = false) {
    await this.ensureAccess(teamId, companyId, userId);

    const nfe = await this.prisma.sefazNFe.findFirst({
      where: { id: nfeId, companyId },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (!nfe.chave) throw new BadRequestException('NF-e sem chave de acesso');
    if (nfe.temXmlCompleto && !force) return { atualizado: false, motivo: 'XML completo já disponível' };
    if (nfe.tipo === 'EMITIDA') return { atualizado: false, motivo: 'NF-e emitida — consulta por chave não permitida pela SEFAZ para o emitente' };

    const company = await this.prisma.company.findFirst({ where: { id: companyId } });
    const cnpj = company!.cnpj!.replace(/\D/g, '');
    const { fileBuffer, password } = await this.certificates.getForIntegration(companyId);
    const httpsAgent = this.buildHttpsAgent(fileBuffer, password);
    const tpAmb = ENV === 'prod' ? '1' : '2';

    const soapBody = this.buildConsChNFeSoap(cnpj, nfe.chave, tpAmb);

    let responseXml: string;
    try {
      const response = await axios.post<string>(SEFAZ_URL[ENV], soapBody, {
        httpsAgent,
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"',
        },
        timeout: 30000,
      });
      console.log(response.data);
      responseXml = response.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao conectar na SEFAZ';
      throw new BadRequestException(`Erro na comunicação com SEFAZ: ${msg}`);
    }

    const parsed = await parseStringPromise(responseXml, { explicitArray: false });
    const body = parsed?.['soap:Envelope']?.['soap:Body'] ?? parsed?.['s:Envelope']?.['s:Body'];
    const retDistDFeInt =
      body?.['nfeDistDFeInteresseResponse']?.['nfeDistDFeInteresseResult']?.['retDistDFeInt'] ??
      body?.['retDistDFeInt'];

    const cStat = retDistDFeInt?.['cStat'] as string;
    const xMotivo = retDistDFeInt?.['xMotivo'] as string;

    // 138 = documento localizado
    if (cStat !== '138') {
      return { atualizado: false, motivo: `${cStat} - ${xMotivo}` };
    }

    const docs = retDistDFeInt?.['loteDistDFeInt']?.['docZip'];
    const documentos: DocZip[] = Array.isArray(docs) ? docs : docs ? [docs] : [];

    for (const doc of documentos) {
      const schema = doc.$?.schema ?? '';
      const xmlGzip = doc._;

      if (!schema.startsWith('procNFe')) continue;

      // Atualiza a nota com o XML completo
      let docParsed: Record<string, unknown> = {};
      try {
        const compressed = Buffer.from(xmlGzip, 'base64');
        const xmlBuffer = await gunzipAsync(compressed);
        docParsed = await parseStringPromise(xmlBuffer.toString('utf-8'), { explicitArray: false });
      } catch { /* mantém campos existentes */ }

      const infNFe = this.extractInfNFe(docParsed, schema);
      const emit = infNFe?.['emit'] as Record<string, unknown>;
      const dest = infNFe?.['dest'] as Record<string, unknown>;
      const total = (infNFe?.['total'] as Record<string, unknown>)?.['ICMSTot'] as Record<string, unknown>;
      const ide = infNFe?.['ide'] as Record<string, unknown>;

      const emitenteCnpj = (emit?.['CNPJ'] as string) ?? (emit?.['CPF'] as string) ?? null;
      const destinCnpj = (dest?.['CNPJ'] as string) ?? (dest?.['CPF'] as string) ?? null;

      const dhEmi = (ide?.['dhEmi'] as string) ?? (ide?.['dEmi'] as string);

      await this.prisma.sefazNFe.update({
        where: { id: nfeId },
        data: {
          xmlGzip,
          temXmlCompleto: true,
          emitenteCnpj: emitenteCnpj ?? nfe.emitenteCnpj,
          emitenteNome: (emit?.['xNome'] as string) ?? nfe.emitenteNome,
          destinCnpj: destinCnpj ?? nfe.destinCnpj,
          destinNome: (dest?.['xNome'] as string) ?? nfe.destinNome,
          valor: total?.['vNF'] ? parseFloat(total['vNF'] as string) : nfe.valor,
          serie: (ide?.['serie'] as string) ?? nfe.serie,
          numero: (ide?.['nNF'] as string) ?? nfe.numero,
          modelo: (ide?.['mod'] as string) ?? nfe.modelo,
          dataEmissao: dhEmi ? new Date(dhEmi) : nfe.dataEmissao,
          tipo: emitenteCnpj === cnpj ? 'EMITIDA' : destinCnpj === cnpj ? 'RECEBIDA' : nfe.tipo,
        },
      });

      return { atualizado: true, motivo: 'XML completo obtido e salvo' };
    }

    return { atualizado: false, motivo: 'Documento não encontrado na resposta' };
  }

  // ─── Busca NF-e na SEFAZ pela chave, cria ou atualiza no banco ──────────────

  async buscarNFePorChave(teamId: string, companyId: string, userId: string, chave: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const chaveLimpa = chave.replace(/\D/g, '');
    if (chaveLimpa.length !== 44) throw new BadRequestException('Chave de acesso inválida — deve ter 44 dígitos');

    const company = await this.prisma.company.findFirst({ where: { id: companyId } });
    if (!company?.cnpj) throw new BadRequestException('Empresa sem CNPJ cadastrado');
    const cnpj = company.cnpj.replace(/\D/g, '');

    const { fileBuffer, password } = await this.certificates.getForIntegration(companyId);
    const httpsAgent = this.buildHttpsAgent(fileBuffer, password);
    const tpAmb = ENV === 'prod' ? '1' : '2';

    const soapBody = this.buildConsChNFeSoap(cnpj, chaveLimpa, tpAmb);

    let responseXml: string;
    try {
      const response = await axios.post<string>(SEFAZ_URL[ENV], soapBody, {
        httpsAgent,
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"',
        },
        timeout: 30000,
      });
      responseXml = response.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao conectar na SEFAZ';
      throw new BadRequestException(`Erro na comunicação com SEFAZ: ${msg}`);
    }

    const parsed = await parseStringPromise(responseXml, { explicitArray: false });
    const body = parsed?.['soap:Envelope']?.['soap:Body'] ?? parsed?.['s:Envelope']?.['s:Body'];
    const retDistDFeInt =
      body?.['nfeDistDFeInteresseResponse']?.['nfeDistDFeInteresseResult']?.['retDistDFeInt'] ??
      body?.['retDistDFeInt'];

    const cStat = retDistDFeInt?.['cStat'] as string;
    const xMotivo = retDistDFeInt?.['xMotivo'] as string;

    if (cStat !== '138') {
      throw new NotFoundException(`Nota não encontrada na SEFAZ: ${cStat} - ${xMotivo}`);
    }

    const docs = retDistDFeInt?.['loteDistDFeInt']?.['docZip'];
    const documentos: DocZip[] = Array.isArray(docs) ? docs : docs ? [docs] : [];

    for (const doc of documentos) {
      const schema = doc.$?.schema ?? '';
      const xmlGzip = doc._;

      if (!schema.startsWith('procNFe') && !schema.startsWith('resNFe') && !schema.startsWith('NFe')) continue;

      const temXmlCompleto = schema.startsWith('procNFe') || schema.startsWith('NFe');

      let docParsed: Record<string, unknown> = {};
      try {
        const compressed = Buffer.from(xmlGzip, 'base64');
        const xmlBuffer = await gunzipAsync(compressed);
        docParsed = await parseStringPromise(xmlBuffer.toString('utf-8'), { explicitArray: false });
      } catch { /* mantém o que veio */ }

      const infNFe = this.extractInfNFe(docParsed, schema);
      const ide = infNFe?.['ide'] as Record<string, unknown>;
      const emit = infNFe?.['emit'] as Record<string, unknown>;
      const dest = infNFe?.['dest'] as Record<string, unknown>;
      const total = (infNFe?.['total'] as Record<string, unknown>)?.['ICMSTot'] as Record<string, unknown>;

      const emitenteCnpj = (emit?.['CNPJ'] as string) ?? (emit?.['CPF'] as string) ?? null;
      const emitenteNome = (emit?.['xNome'] as string) ?? null;
      const destinCnpj = (dest?.['CNPJ'] as string) ?? (dest?.['CPF'] as string) ?? null;
      const destinNome = (dest?.['xNome'] as string) ?? null;
      const valor = total?.['vNF'] ? parseFloat(total['vNF'] as string) : null;
      const dhEmi = (ide?.['dhEmi'] as string) ?? (ide?.['dEmi'] as string);
      const dataEmissao = dhEmi ? new Date(dhEmi) : null;
      const serie = (ide?.['serie'] as string) ?? null;
      const numero = (ide?.['nNF'] as string) ?? null;
      const modelo = (ide?.['mod'] as string) ?? null;
      const tipo = emitenteCnpj === cnpj ? 'EMITIDA' : destinCnpj === cnpj ? 'RECEBIDA' : null;

      const nfe = await this.prisma.sefazNFe.upsert({
        where: { companyId_chave: { companyId, chave: chaveLimpa } },
        create: {
          companyId, chave: chaveLimpa, nsu: null, tipo, modelo,
          emitenteCnpj, emitenteNome, destinCnpj, destinNome,
          valor, serie, numero, dataEmissao,
          xmlGzip: temXmlCompleto ? xmlGzip : null,
          temXmlCompleto,
        },
        update: {
          modelo,
          ...(emitenteCnpj && { emitenteCnpj }),
          ...(emitenteNome && { emitenteNome }),
          ...(destinCnpj && { destinCnpj }),
          ...(destinNome && { destinNome }),
          ...(valor !== null && { valor }),
          ...(serie && { serie }),
          ...(numero && { numero }),
          ...(dataEmissao && { dataEmissao }),
          ...(tipo && { tipo }),
          ...(temXmlCompleto && { xmlGzip, temXmlCompleto: true }),
        },
      });

      return this.getNFe(teamId, companyId, userId, nfe.id);
    }

    throw new NotFoundException('Documento não encontrado na resposta da SEFAZ');
  }

  private buildConsChNFeSoap(cnpj: string, chNFe: string, tpAmb: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <CNPJ>${cnpj}</CNPJ>
          <consChNFe>
            <chNFe>${chNFe}</chNFe>
          </consChNFe>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildHttpsAgent(fileBuffer: Buffer, password: string) {
    const p12Asn1 = forge.asn1.fromDer(fileBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
    const certificate = certBags[forge.pki.oids.certBag]?.[0]?.cert;
    if (!privateKey || !certificate) throw new BadRequestException('Certificado inválido ou corrompido');
    return new https.Agent({
      key: forge.pki.privateKeyToPem(privateKey),
      cert: forge.pki.certificateToPem(certificate),
      rejectUnauthorized: true,
    });
  }

  private async parseResponse(xml: string) {
    const parsed = await parseStringPromise(xml, { explicitArray: false });
    const body = parsed?.['soap:Envelope']?.['soap:Body'] ?? parsed?.['s:Envelope']?.['s:Body'];
    const retDistDFeInt =
      body?.['nfeDistDFeInteresseResponse']?.['nfeDistDFeInteresseResult']?.['retDistDFeInt'] ??
      body?.['retDistDFeInt'];
    if (!retDistDFeInt) throw new BadRequestException('Resposta inválida da SEFAZ');

    const cStat = retDistDFeInt?.['cStat'] as string;
    const xMotivo = retDistDFeInt?.['xMotivo'] as string;
    const ultNsu = (retDistDFeInt?.['ultNSU'] as string) ?? '000000000000000';
    const maxNsu = (retDistDFeInt?.['maxNSU'] as string) ?? '000000000000000';
    const docs = retDistDFeInt?.['loteDistDFeInt']?.['docZip'];
    const documentos: DocZip[] = Array.isArray(docs) ? docs : docs ? [docs] : [];

    return { cStat, xMotivo, ultNsu, maxNsu, documentos };
  }

  private buildSoapRequest(cnpj: string, ultNsu: string, tpAmb: string): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <CNPJ>${cnpj}</CNPJ>
          <distNSU>
            <ultNSU>${ultNsu}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
  }

  // ─── Manifestação do Destinatário ────────────────────────────────────────

  async manifestar(
    teamId: string,
    companyId: string,
    userId: string,
    nfeId: string,
    tipo: 'CIENCIA' | 'CONFIRMADA' | 'DESCONHECIMENTO' | 'NAO_REALIZADA',
    justificativa?: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const nfe = await this.prisma.sefazNFe.findFirst({
      where: { id: nfeId, companyId },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.tipo !== 'RECEBIDA') throw new BadRequestException('Manifestação só é permitida em NF-es recebidas');
    if (!nfe.chave) throw new BadRequestException('NF-e sem chave de acesso');

    const TIPO_EVENTO: Record<string, { tpEvento: string; xEvento: string }> = {
      CIENCIA:          { tpEvento: '210210', xEvento: 'Ciencia da Operacao' },
      CONFIRMADA:       { tpEvento: '210200', xEvento: 'Confirmacao da Operacao' },
      DESCONHECIMENTO:  { tpEvento: '220200', xEvento: 'Desconhecimento da Operacao' },
      NAO_REALIZADA:    { tpEvento: '210240', xEvento: 'Operacao nao Realizada' },
    };

    const { tpEvento, xEvento } = TIPO_EVENTO[tipo];

    if ((tipo === 'DESCONHECIMENTO' || tipo === 'NAO_REALIZADA') && !justificativa) {
      throw new BadRequestException('Justificativa obrigatória para este tipo de manifestação (mínimo 15 caracteres)');
    }
    if (justificativa && justificativa.length < 15) {
      throw new BadRequestException('Justificativa deve ter no mínimo 15 caracteres');
    }

    const company = await this.prisma.company.findFirst({ where: { id: companyId } });
    const cnpj = company!.cnpj!.replace(/\D/g, '');
    const { fileBuffer, password } = await this.certificates.getForIntegration(companyId);
    const httpsAgent = this.buildHttpsAgent(fileBuffer, password);

    const dhEvento = new Date().toISOString().replace('Z', '-00:00');
    const nSeqEvento = '1';
    const tpAmb = ENV === 'prod' ? '1' : '2';

    const soapBody = this.buildManifestacaoSoap(cnpj, nfe.chave, tpEvento, xEvento, dhEvento, nSeqEvento, tpAmb, justificativa);

    const RECEPCAO_URL = {
      homolog: 'https://hom.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
      prod: 'https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    };

    let responseXml: string;
    try {
      const response = await axios.post<string>(RECEPCAO_URL[ENV], soapBody, {
        httpsAgent,
        headers: {
          'Content-Type': 'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"',
        },
        timeout: 30000,
      });
      responseXml = response.data;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao conectar na SEFAZ';
      throw new BadRequestException(`Erro na comunicação com SEFAZ: ${msg}`);
    }

    const parsed = await parseStringPromise(responseXml, { explicitArray: false });
    const body = parsed?.['soap:Envelope']?.['soap:Body'] ?? parsed?.['s:Envelope']?.['s:Body'];
    const retEvento =
      body?.['nfeRecepcaoEventoNFResult']?.['retEnvEvento']?.['retEvento']?.['infEvento'] ??
      body?.['retEnvEvento']?.['retEvento']?.['infEvento'];

    const cStat = retEvento?.['cStat'] as string;
    const xMotivo = retEvento?.['xMotivo'] as string;
    const nProt = retEvento?.['nProt'] as string;

    // 135 = evento registrado, 136 = vinculado
    if (cStat !== '135' && cStat !== '136') {
      throw new BadRequestException(`SEFAZ recusou manifestação: ${cStat} - ${xMotivo}`);
    }

    // Atualiza manifestação na NF-e
    await this.prisma.sefazNFe.update({
      where: { id: nfeId },
      data: { manifestacao: tipo },
    });

    // Salva evento de manifestação no histórico
    await this.prisma.sefazEvento.create({
      data: {
        companyId,
        nfeId,
        chaveNFe: nfe.chave,
        nsu: `MDE-${nfeId}-${tpEvento}`,
        tpEvento,
        xEvento,
        dataEvento: new Date(),
        protocolo: nProt ?? null,
        schema: 'procEventoNFe_v1.00.xsd',
        xmlGzip: Buffer.from(responseXml).toString('base64'),
      },
    });

    return { sucesso: true, manifestacao: tipo, protocolo: nProt, motivo: xMotivo };
  }

  private buildManifestacaoSoap(
    cnpj: string,
    chNFe: string,
    tpEvento: string,
    xEvento: string,
    dhEvento: string,
    nSeqEvento: string,
    tpAmb: string,
    justificativa?: string,
  ): string {
    const xCondUso = justificativa
      ? `<xCondUso>${justificativa}</xCondUso>`
      : '';

    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      <nfeDadosMsg>
        <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
          <idLote>1</idLote>
          <evento versao="1.00">
            <infEvento Id="ID${tpEvento}${chNFe}${nSeqEvento.padStart(2, '0')}">
              <cOrgao>91</cOrgao>
              <tpAmb>${tpAmb}</tpAmb>
              <CNPJ>${cnpj}</CNPJ>
              <chNFe>${chNFe}</chNFe>
              <dhEvento>${dhEvento}</dhEvento>
              <tpEvento>${tpEvento}</tpEvento>
              <nSeqEvento>${nSeqEvento}</nSeqEvento>
              <verEvento>1.00</verEvento>
              <detEvento versao="1.00">
                <descEvento>${xEvento}</descEvento>
                ${xCondUso}
              </detEvento>
            </infEvento>
          </evento>
        </envEvento>
      </nfeDadosMsg>
    </nfeRecepcaoEvento>
  </soap12:Body>
</soap12:Envelope>`;
  }

  private async ensureAccess(teamId: string, companyId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member) throw new BadRequestException('Você não é membro dessa equipe');
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
  }
}
