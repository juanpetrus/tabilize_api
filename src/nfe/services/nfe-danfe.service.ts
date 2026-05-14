import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { gunzipSync } from 'node:zlib';
import { chromium } from 'playwright';
import { parseStringPromise } from 'xml2js';
import { PrismaService } from '../../database/index.js';
import { NfeStatus } from '../../../generated/prisma/enums.js';

@Injectable()
export class NfeDanfeService {
  constructor(private readonly prisma: PrismaService) {}

  async gerar(nfeId: string): Promise<Buffer> {
    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, isActive: true },
      select: { id: true, status: true, xmlAutorizado: true, chave: true },
    });

    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    if (nfe.status !== NfeStatus.AUTORIZADA) {
      throw new BadRequestException('Apenas notas autorizadas geram DANFE');
    }

    if (!nfe.xmlAutorizado) {
      throw new BadRequestException(
        'XML autorizado não disponível — re-transmita a nota',
      );
    }

    const xmlBuffer = gunzipSync(Buffer.from(nfe.xmlAutorizado, 'base64'));
    const parsed = (await parseStringPromise(xmlBuffer.toString('utf-8'), {
      explicitArray: false,
    })) as Record<string, unknown>;

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

  // TODO: extrair para shared helper (duplicado de sefaz.service.ts)
  private parseNFeDetails(parsed: Record<string, unknown>) {
    const infNFe = ((
      (parsed?.['nfeProc'] as Record<string, unknown>)?.['NFe'] as Record<
        string,
        unknown
      >
    )?.['infNFe'] ??
      (parsed?.['NFe'] as Record<string, unknown>)?.['infNFe']) as Record<
      string,
      unknown
    >;

    const ide = infNFe?.['ide'] as Record<string, unknown>;
    const emit = infNFe?.['emit'] as Record<string, unknown>;
    const dest = infNFe?.['dest'] as Record<string, unknown>;
    const total = (infNFe?.['total'] as Record<string, unknown>)?.[
      'ICMSTot'
    ] as Record<string, unknown>;
    const transp = infNFe?.['transp'] as Record<string, unknown>;
    const infAdic = infNFe?.['infAdic'] as Record<string, unknown>;
    const protNFe = (parsed?.['nfeProc'] as Record<string, unknown>)?.[
      'protNFe'
    ] as Record<string, unknown>;
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
        valorUnitario: prod?.['vUnCom']
          ? parseFloat(prod['vUnCom'] as string)
          : null,
        valorTotal: prod?.['vProd']
          ? parseFloat(prod['vProd'] as string)
          : null,
      };
    });

    return {
      numero: ide?.['nNF'],
      serie: ide?.['serie'],
      naturezaOperacao: ide?.['natOp'],
      emitente: {
        documento:
          (emit?.['CNPJ'] as string) ?? (emit?.['CPF'] as string) ?? null,
        nome: emit?.['xNome'],
        fantasia: emit?.['xFant'],
        ie: emit?.['IE'],
      },
      destinatario: {
        documento:
          (dest?.['CNPJ'] as string) ?? (dest?.['CPF'] as string) ?? null,
        nome: dest?.['xNome'],
        ie: dest?.['IE'],
      },
      totais: {
        produtos: total?.['vProd']
          ? parseFloat(total['vProd'] as string)
          : null,
        frete: total?.['vFrete'] ? parseFloat(total['vFrete'] as string) : null,
        desconto: total?.['vDesc']
          ? parseFloat(total['vDesc'] as string)
          : null,
        icms: total?.['vICMS'] ? parseFloat(total['vICMS'] as string) : null,
        ipi: total?.['vIPI'] ? parseFloat(total['vIPI'] as string) : null,
        pis: total?.['vPIS'] ? parseFloat(total['vPIS'] as string) : null,
        cofins: total?.['vCOFINS']
          ? parseFloat(total['vCOFINS'] as string)
          : null,
        valorNota: total?.['vNF'] ? parseFloat(total['vNF'] as string) : null,
      },
      transporte: { modalidade: transp?.['modFrete'] },
      protocolo: infProt
        ? {
            numero: infProt?.['nProt'],
            dataAutorizacao: infProt?.['dhRecbto'],
            status: infProt?.['cStat'],
            motivo: infProt?.['xMotivo'],
          }
        : null,
      informacoesAdicionais: (infAdic?.['infCpl'] as string) ?? null,
      itens,
    };
  }

  // TODO: extrair para shared helper (duplicado de sefaz.service.ts)
  private buildDanfeHtml(
    d: ReturnType<typeof this.parseNFeDetails>,
    chave: string,
  ): string {
    const fmt = (v: number | null | undefined) =>
      v != null ? v.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '-';

    const fmtDoc = (doc: string | null | undefined) => {
      if (!doc) return '-';
      if (doc.length === 14)
        return doc.replace(
          /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
          '$1.$2.$3/$4-$5',
        );
      if (doc.length === 11)
        return doc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
      return doc;
    };

    const chaveFormatada = chave.replace(/(\d{4})/g, '$1 ').trim();

    const itensHtml = d.itens
      .map(
        (it, i) => `
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
      </tr>`,
      )
      .join('');

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

  ${
    d.informacoesAdicionais
      ? `
  <div class="section">
    <div class="section-title">Informações Adicionais</div>
    <div>${d.informacoesAdicionais}</div>
  </div>`
      : ''
  }

  <!-- PROTOCOLO -->
  ${
    d.protocolo
      ? `
  <div class="protocolo">
    Protocolo de Autorização: ${d.protocolo.numero ?? '-'} &nbsp;|&nbsp;
    Data: ${d.protocolo.dataAutorizacao ? new Date(String(d.protocolo.dataAutorizacao)).toLocaleString('pt-BR') : '-'} &nbsp;|&nbsp;
    Status: ${d.protocolo.status} - ${d.protocolo.motivo}
  </div>`
      : ''
  }

</div>
</body>
</html>`;
  }
}
