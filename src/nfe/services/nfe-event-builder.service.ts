import { BadRequestException, Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';

export type EventoTipo = 'CANCELAMENTO' | 'CARTA_CORRECAO';

const TP_EVENTO: Record<EventoTipo, string> = {
  CANCELAMENTO: '110111',
  CARTA_CORRECAO: '110110',
};

const DESC_EVENTO: Record<EventoTipo, string> = {
  CANCELAMENTO: 'Cancelamento',
  CARTA_CORRECAO: 'Carta de Correcao',
};

const X_COND_USO =
  'A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do ' +
  'Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para ' +
  'regularizacao de erro ocorrido na emissao de documento fiscal, desde que o ' +
  'erro nao esteja relacionado com: I - as variaveis que determinam o valor ' +
  'do imposto tais como: base de calculo, aliquota, diferenca de preco, ' +
  'quantidade, valor da operacao ou da prestacao; II - a correcao de dados ' +
  'cadastrais que implique mudanca do remetente ou do destinatario; III - a ' +
  'data de emissao ou de saida.';

export interface BuildEventoParams {
  tipo: EventoTipo;
  chave: string;
  cnpj: string;
  cUF: string;
  ambiente: 'PRODUCAO' | 'HOMOLOGACAO';
  sequencia: number;
  dhEvento: Date;
  justificativa?: string;
  textoCorrecao?: string;
  nProtNFe?: string;
}

export interface BuildEventoResult {
  xml: string;
  idEvento: string;
}

/**
 * Monta o XML `<envEvento>` de eventos da NF-e: cancelamento (110111) e
 * carta de correção (110110).
 */
@Injectable()
export class NfeEventBuilderService {
  build(params: BuildEventoParams): BuildEventoResult {
    const {
      tipo,
      chave,
      cnpj,
      cUF,
      ambiente,
      sequencia,
      dhEvento,
      justificativa,
      textoCorrecao,
      nProtNFe,
    } = params;

    // Validações específicas
    if (chave.length !== 44 || !/^\d+$/.test(chave)) {
      throw new BadRequestException('Chave de acesso inválida (esperado 44 dígitos)');
    }
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new BadRequestException('CNPJ do emitente inválido');
    }
    if (cUF.length !== 2 || !/^\d{2}$/.test(cUF)) {
      throw new BadRequestException('cUF inválido (esperado 2 dígitos)');
    }
    if (sequencia < 1 || sequencia > 99) {
      throw new BadRequestException(
        'Sequência do evento deve estar entre 1 e 99',
      );
    }

    if (tipo === 'CANCELAMENTO') {
      if (!justificativa) {
        throw new BadRequestException(
          'Justificativa é obrigatória para cancelamento',
        );
      }
      if (!nProtNFe) {
        throw new BadRequestException(
          'Protocolo da NF-e é obrigatório para cancelamento',
        );
      }
    } else if (tipo === 'CARTA_CORRECAO') {
      if (!textoCorrecao) {
        throw new BadRequestException(
          'Texto de correção é obrigatório para CC-e',
        );
      }
    }

    const tpEvento = TP_EVENTO[tipo];
    const descEvento = DESC_EVENTO[tipo];
    const seqPadded = sequencia.toString().padStart(2, '0');
    const idEvento = `ID${tpEvento}${chave}${seqPadded}`;
    const tpAmb = ambiente === 'PRODUCAO' ? '1' : '2';

    // idLote — 15 dígitos (timestamp ms truncado se exceder)
    const idLote = Date.now().toString().slice(-15);

    const dhEventoIso = this.formatDhEvento(dhEvento);

    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('envEvento', {
      xmlns: 'http://www.portalfiscal.inf.br/nfe',
      versao: '1.00',
    });
    doc.ele('idLote').txt(idLote);

    const evento = doc.ele('evento', { versao: '1.00' });
    const infEvento = evento.ele('infEvento', { Id: idEvento });
    infEvento.ele('cOrgao').txt(cUF);
    infEvento.ele('tpAmb').txt(tpAmb);
    infEvento.ele('CNPJ').txt(cnpjLimpo);
    infEvento.ele('chNFe').txt(chave);
    infEvento.ele('dhEvento').txt(dhEventoIso);
    infEvento.ele('tpEvento').txt(tpEvento);
    infEvento.ele('nSeqEvento').txt(String(sequencia));
    infEvento.ele('verEvento').txt('1.00');

    const detEvento = infEvento.ele('detEvento', { versao: '1.00' });
    detEvento.ele('descEvento').txt(descEvento);

    if (tipo === 'CANCELAMENTO') {
      detEvento.ele('nProt').txt(nProtNFe as string);
      detEvento.ele('xJust').txt(justificativa as string);
    } else {
      detEvento.ele('xCorrecao').txt(textoCorrecao as string);
      detEvento.ele('xCondUso').txt(X_COND_USO);
    }

    const xml = doc.end({ headless: false });

    return { xml, idEvento };
  }

  /**
   * Formata a data no padrão `YYYY-MM-DDTHH:mm:ss-03:00` exigido pela SEFAZ.
   * Usa fuso fixo -03:00 (Brasília) — não considera horário de verão.
   */
  private formatDhEvento(date: Date): string {
    // Converte para -03:00 a partir do UTC
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
}
