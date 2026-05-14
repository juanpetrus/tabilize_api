import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import https from 'https';
import * as forge from 'node-forge';
import { parseStringPromise } from 'xml2js';
import { CertificatesService } from '../../certificates/certificates.service.js';
import {
  getNfeInutilizacao4Url,
  getNfeRecepcaoEvento4Url,
  type Ambiente,
} from '../helpers/nfe-webservice-urls.js';

// ─── Tipagem da resposta SOAP/SEFAZ ───────────────────────────────────────

interface RetEventoInfEvento {
  tpAmb?: string;
  verAplic?: string;
  cOrgao?: string;
  cStat?: string;
  xMotivo?: string;
  chNFe?: string;
  tpEvento?: string;
  xEvento?: string;
  nSeqEvento?: string;
  dhRegEvento?: string;
  nProt?: string;
}

interface RetEvento {
  $?: { versao?: string };
  infEvento?: RetEventoInfEvento;
}

interface RetEnvEvento {
  idLote?: string;
  tpAmb?: string;
  verAplic?: string;
  cOrgao?: string;
  cStat?: string;
  xMotivo?: string;
  retEvento?: RetEvento | RetEvento[];
}

interface RetInutInfInut {
  tpAmb?: string;
  verAplic?: string;
  cStat?: string;
  xMotivo?: string;
  cUF?: string;
  ano?: string;
  CNPJ?: string;
  mod?: string;
  serie?: string;
  nNFIni?: string;
  nNFFin?: string;
  dhRecbto?: string;
  nProt?: string;
}

interface RetInutNFe {
  $?: { versao?: string };
  infInut?: RetInutInfInut;
}

interface SoapBodyEvento {
  nfeResultMsg?: { retEnvEvento?: RetEnvEvento } | string;
  nfeRecepcaoEventoNFResult?: { retEnvEvento?: RetEnvEvento } | string;
  retEnvEvento?: RetEnvEvento;
}

interface SoapBodyInut {
  nfeResultMsg?: { retInutNFe?: RetInutNFe } | string;
  nfeInutilizacaoNFResult?: { retInutNFe?: RetInutNFe } | string;
  retInutNFe?: RetInutNFe;
}

interface SoapEnvelopeEvento {
  'soap:Envelope'?: { 'soap:Body'?: SoapBodyEvento };
  'soap12:Envelope'?: { 'soap12:Body'?: SoapBodyEvento };
  's:Envelope'?: { 's:Body'?: SoapBodyEvento };
  Envelope?: { Body?: SoapBodyEvento };
}

interface SoapEnvelopeInut {
  'soap:Envelope'?: { 'soap:Body'?: SoapBodyInut };
  'soap12:Envelope'?: { 'soap12:Body'?: SoapBodyInut };
  's:Envelope'?: { 's:Body'?: SoapBodyInut };
  Envelope?: { Body?: SoapBodyInut };
}

// ─── Resultados expostos ──────────────────────────────────────────────────

export interface TransmissaoEventoResultado {
  cStat: string;
  xMotivo: string;
  protocolo?: string;
  dhRegEvento?: Date;
  xmlResposta: string;
}

export interface TransmissaoInutilizacaoResultado {
  cStat: string;
  xMotivo: string;
  protocolo?: string;
  dhRecbto?: Date;
  xmlResposta: string;
}

@Injectable()
export class NfeEventTransmitterService {
  constructor(private readonly certificates: CertificatesService) {}

  async transmitEvento(params: {
    xmlEnvEventoAssinado: string;
    uf: string;
    ambiente: Ambiente;
    companyId: string;
  }): Promise<TransmissaoEventoResultado> {
    const { xmlEnvEventoAssinado, uf, ambiente, companyId } = params;
    const url = getNfeRecepcaoEvento4Url(uf, ambiente);

    const envEvento = this.stripXmlDeclaration(xmlEnvEventoAssinado);

    const soapEnvelope =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap:Body>` +
      `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">` +
      `${envEvento}` +
      `</nfeDadosMsg>` +
      `</soap:Body>` +
      `</soap:Envelope>`;

    const { fileBuffer, password } =
      await this.certificates.getForIntegration(companyId);
    const httpsAgent = this.buildHttpsAgent(fileBuffer, password);

    let responseXml: string;
    try {
      const response = await axios.post<string>(url, soapEnvelope, {
        httpsAgent,
        headers: {
          'Content-Type':
            'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"',
        },
        timeout: 60000,
        responseType: 'text',
        transformResponse: [(data: string) => data],
      });
      responseXml = response.data;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao conectar na SEFAZ';
      throw new BadRequestException(`Erro na comunicação com SEFAZ: ${msg}`);
    }

    return this.parseEventoResponse(responseXml);
  }

  async transmitInutilizacao(params: {
    xmlInutNFeAssinado: string;
    uf: string;
    ambiente: Ambiente;
    companyId: string;
  }): Promise<TransmissaoInutilizacaoResultado> {
    const { xmlInutNFeAssinado, uf, ambiente, companyId } = params;
    const url = getNfeInutilizacao4Url(uf, ambiente);

    const inutNFe = this.stripXmlDeclaration(xmlInutNFeAssinado);

    const soapEnvelope =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap:Body>` +
      `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4">` +
      `${inutNFe}` +
      `</nfeDadosMsg>` +
      `</soap:Body>` +
      `</soap:Envelope>`;

    const { fileBuffer, password } =
      await this.certificates.getForIntegration(companyId);
    const httpsAgent = this.buildHttpsAgent(fileBuffer, password);

    let responseXml: string;
    try {
      const response = await axios.post<string>(url, soapEnvelope, {
        httpsAgent,
        headers: {
          'Content-Type':
            'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4/nfeInutilizacaoNF"',
        },
        timeout: 60000,
        responseType: 'text',
        transformResponse: [(data: string) => data],
      });
      responseXml = response.data;
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao conectar na SEFAZ';
      throw new BadRequestException(`Erro na comunicação com SEFAZ: ${msg}`);
    }

    return this.parseInutilizacaoResponse(responseXml);
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  private stripXmlDeclaration(xml: string): string {
    return xml.replace(/^\s*<\?xml[^?]*\?>\s*/i, '');
  }

  private buildHttpsAgent(fileBuffer: Buffer, password: string): https.Agent {
    const p12Asn1 = forge.asn1.fromDer(fileBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    const keyBags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
    const certificate = certBags[forge.pki.oids.certBag]?.[0]?.cert;
    if (!privateKey || !certificate) {
      throw new BadRequestException('Certificado inválido ou corrompido');
    }
    return new https.Agent({
      key: forge.pki.privateKeyToPem(privateKey),
      cert: forge.pki.certificateToPem(certificate),
      rejectUnauthorized: true,
    });
  }

  private async parseEventoResponse(
    responseXml: string,
  ): Promise<TransmissaoEventoResultado> {
    let parsed: SoapEnvelopeEvento;
    try {
      parsed = (await parseStringPromise(responseXml, {
        explicitArray: false,
      })) as SoapEnvelopeEvento;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'parse falhou';
      throw new BadRequestException(
        `Erro ao parsear resposta da SEFAZ: ${msg}`,
      );
    }

    const body: SoapBodyEvento | undefined =
      parsed['soap:Envelope']?.['soap:Body'] ??
      parsed['soap12:Envelope']?.['soap12:Body'] ??
      parsed['s:Envelope']?.['s:Body'] ??
      parsed.Envelope?.Body;

    if (!body) {
      throw new BadRequestException(
        'Resposta SEFAZ sem envelope SOAP reconhecível',
      );
    }

    const resultEnvelope =
      this.unwrapResult(body.nfeResultMsg) ??
      this.unwrapResult(body.nfeRecepcaoEventoNFResult);

    const retEnvEvento: RetEnvEvento | undefined =
      resultEnvelope?.retEnvEvento ?? body.retEnvEvento;

    if (!retEnvEvento) {
      throw new BadRequestException(
        'Resposta SEFAZ sem retEnvEvento — formato inesperado',
      );
    }

    const loteCStat = retEnvEvento.cStat ?? '';
    const loteXMotivo = retEnvEvento.xMotivo ?? '';

    const retEvento = Array.isArray(retEnvEvento.retEvento)
      ? retEnvEvento.retEvento[0]
      : retEnvEvento.retEvento;

    const infEvento = retEvento?.infEvento;

    if (!infEvento) {
      return {
        cStat: loteCStat,
        xMotivo: loteXMotivo,
        xmlResposta: responseXml,
      };
    }

    const cStat = infEvento.cStat ?? loteCStat;
    const xMotivo = infEvento.xMotivo ?? loteXMotivo;
    const dhRegEvento =
      infEvento.dhRegEvento != null && infEvento.dhRegEvento !== ''
        ? new Date(infEvento.dhRegEvento)
        : undefined;

    return {
      cStat,
      xMotivo,
      protocolo: infEvento.nProt,
      dhRegEvento,
      xmlResposta: responseXml,
    };
  }

  private async parseInutilizacaoResponse(
    responseXml: string,
  ): Promise<TransmissaoInutilizacaoResultado> {
    let parsed: SoapEnvelopeInut;
    try {
      parsed = (await parseStringPromise(responseXml, {
        explicitArray: false,
      })) as SoapEnvelopeInut;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'parse falhou';
      throw new BadRequestException(
        `Erro ao parsear resposta da SEFAZ: ${msg}`,
      );
    }

    const body: SoapBodyInut | undefined =
      parsed['soap:Envelope']?.['soap:Body'] ??
      parsed['soap12:Envelope']?.['soap12:Body'] ??
      parsed['s:Envelope']?.['s:Body'] ??
      parsed.Envelope?.Body;

    if (!body) {
      throw new BadRequestException(
        'Resposta SEFAZ sem envelope SOAP reconhecível',
      );
    }

    const resultEnvelope =
      this.unwrapInutResult(body.nfeResultMsg) ??
      this.unwrapInutResult(body.nfeInutilizacaoNFResult);

    const retInutNFe: RetInutNFe | undefined =
      resultEnvelope?.retInutNFe ?? body.retInutNFe;

    if (!retInutNFe) {
      throw new BadRequestException(
        'Resposta SEFAZ sem retInutNFe — formato inesperado',
      );
    }

    const infInut = retInutNFe.infInut;
    if (!infInut) {
      throw new BadRequestException(
        'Resposta SEFAZ sem infInut — formato inesperado',
      );
    }

    const cStat = infInut.cStat ?? '';
    const xMotivo = infInut.xMotivo ?? '';
    const dhRecbto =
      infInut.dhRecbto != null && infInut.dhRecbto !== ''
        ? new Date(infInut.dhRecbto)
        : undefined;

    return {
      cStat,
      xMotivo,
      protocolo: infInut.nProt,
      dhRecbto,
      xmlResposta: responseXml,
    };
  }

  private unwrapResult(
    value: { retEnvEvento?: RetEnvEvento } | string | undefined,
  ): { retEnvEvento?: RetEnvEvento } | undefined {
    if (typeof value === 'object' && value !== null) return value;
    return undefined;
  }

  private unwrapInutResult(
    value: { retInutNFe?: RetInutNFe } | string | undefined,
  ): { retInutNFe?: RetInutNFe } | undefined {
    if (typeof value === 'object' && value !== null) return value;
    return undefined;
  }
}
