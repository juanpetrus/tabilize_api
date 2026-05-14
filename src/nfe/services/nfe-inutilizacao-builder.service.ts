import { BadRequestException, Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';

export interface BuildInutilizacaoParams {
  cUF: string;
  ano: number; // AAAA — usado para o atributo `ano` (2 últimos dígitos)
  cnpj: string;
  serie: string; // até 3 dígitos
  numeroInicial: number;
  numeroFinal: number;
  justificativa: string;
  ambiente: 'PRODUCAO' | 'HOMOLOGACAO';
}

export interface BuildInutilizacaoResult {
  xml: string;
  idInut: string;
}

/**
 * Monta o XML `<inutNFe>` para inutilização de faixa de numeração (modelo 55).
 */
@Injectable()
export class NfeInutilizacaoBuilderService {
  build(params: BuildInutilizacaoParams): BuildInutilizacaoResult {
    const {
      cUF,
      ano,
      cnpj,
      serie,
      numeroInicial,
      numeroFinal,
      justificativa,
      ambiente,
    } = params;

    if (cUF.length !== 2 || !/^\d{2}$/.test(cUF)) {
      throw new BadRequestException('cUF inválido (esperado 2 dígitos)');
    }
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new BadRequestException('CNPJ inválido');
    }
    if (!/^\d{1,3}$/.test(serie)) {
      throw new BadRequestException('Série inválida (1 a 3 dígitos numéricos)');
    }
    if (numeroInicial < 1 || numeroFinal < numeroInicial) {
      throw new BadRequestException('Faixa de numeração inválida');
    }
    if (justificativa.length < 15 || justificativa.length > 255) {
      throw new BadRequestException(
        'Justificativa deve ter entre 15 e 255 caracteres',
      );
    }
    if (ano < 0) {
      throw new BadRequestException('Ano inválido');
    }

    const anoAA = (ano % 100).toString().padStart(2, '0');
    const seriePadded = serie.padStart(3, '0');
    const nIniPadded = numeroInicial.toString().padStart(9, '0');
    const nFinPadded = numeroFinal.toString().padStart(9, '0');

    // Id = "ID" + cUF(2) + ano(2) + CNPJ(14) + mod(2=55) + serie(3) + nNFIni(9) + nNFFin(9) = 41 chars + "ID"
    const idInut = `ID${cUF}${anoAA}${cnpjLimpo}55${seriePadded}${nIniPadded}${nFinPadded}`;
    const tpAmb = ambiente === 'PRODUCAO' ? '1' : '2';

    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('inutNFe', {
      xmlns: 'http://www.portalfiscal.inf.br/nfe',
      versao: '4.00',
    });

    const infInut = doc.ele('infInut', { Id: idInut });
    infInut.ele('tpAmb').txt(tpAmb);
    infInut.ele('xServ').txt('INUTILIZAR');
    infInut.ele('cUF').txt(cUF);
    infInut.ele('ano').txt(anoAA);
    infInut.ele('CNPJ').txt(cnpjLimpo);
    infInut.ele('mod').txt('55');
    infInut.ele('serie').txt(String(Number(serie)));
    infInut.ele('nNFIni').txt(String(numeroInicial));
    infInut.ele('nNFFin').txt(String(numeroFinal));
    infInut.ele('xJust').txt(justificativa);

    const xml = doc.end({ headless: false });
    return { xml, idInut };
  }
}
