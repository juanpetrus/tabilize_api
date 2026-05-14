import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import https from 'https';
import * as forge from 'node-forge';
import { Builder, parseStringPromise } from 'xml2js';
import { CertificatesService } from '../../certificates/certificates.service.js';
import {
  getNfeAutorizacao4Url,
  type Ambiente,
} from '../helpers/nfe-webservice-urls.js';

// ─── Tipagem da resposta SOAP/SEFAZ ───────────────────────────────────────

/**
 * Estrutura do `<infProt>` dentro do `<protNFe>` retornado pela SEFAZ
 * em modo síncrono (`indSinc=1`).
 */
interface InfProt {
  tpAmb?: string;
  verAplic?: string;
  chNFe?: string;
  dhRecbto?: string;
  nProt?: string;
  digVal?: string;
  cStat?: string;
  xMotivo?: string;
}

/**
 * Estrutura do `<protNFe>` (pode vir com atributos via parser).
 */
interface ProtNFe {
  $?: { versao?: string };
  infProt?: InfProt;
}

/**
 * Estrutura do `<retEnviNFe>` retornado pela SEFAZ.
 * Em modo síncrono o `protNFe` vem direto aqui.
 */
interface RetEnviNFe {
  tpAmb?: string;
  verAplic?: string;
  cStat?: string;
  xMotivo?: string;
  cUF?: string;
  dhRecbto?: string;
  infRec?: { nRec?: string; tMed?: string };
  protNFe?: ProtNFe;
}

/**
 * Estrutura mínima do envelope SOAP retornado.
 */
interface SoapBody {
  nfeResultMsg?: { retEnviNFe?: RetEnviNFe } | string;
  retEnviNFe?: RetEnviNFe;
}

interface SoapEnvelope {
  'soap:Envelope'?: { 'soap:Body'?: SoapBody };
  'soap12:Envelope'?: { 'soap12:Body'?: SoapBody };
  's:Envelope'?: { 's:Body'?: SoapBody };
  Envelope?: { Body?: SoapBody };
}

// ─── Resultado da transmissão ─────────────────────────────────────────────

export interface TransmissaoResultado {
  cStat: string;
  xMotivo: string;
  dhRecbto?: Date;
  /** Protocolo de autorização (nProt) — presente apenas quando autorizada. */
  protocolo?: string;
  /**
   * XML cru `<protNFe>...</protNFe>` extraído da resposta, para compor o
   * `<nfeProc>` final junto da NFe assinada. Presente apenas quando autorizada.
   */
  xmlProtNFe?: string;
}

@Injectable()
export class NfeTransmitterService {
  constructor(private readonly certificates: CertificatesService) {}

  async transmit(params: {
    xmlNFeAssinado: string;
    chave: string;
    cnpjEmitente: string;
    companyId: string;
    uf: string;
    ambiente: Ambiente;
  }): Promise<TransmissaoResultado> {
    const { xmlNFeAssinado, companyId, uf, ambiente } = params;

    const url = getNfeAutorizacao4Url(uf, ambiente);

    // 1) Strip da declaração XML do NFe assinado, se vier
    const nfeSemDecl = this.stripXmlDeclaration(xmlNFeAssinado);

    // 2) Monta envelope <enviNFe> síncrono
    const idLote = Date.now().toString();
    const enviNFe =
      `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">` +
      `<idLote>${idLote}</idLote>` +
      `<indSinc>1</indSinc>` +
      `${nfeSemDecl}` +
      `</enviNFe>`;

    // 3) Envelope SOAP 1.2
    const soapEnvelope =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">` +
      `<soap:Body>` +
      `<nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">` +
      `${enviNFe}` +
      `</nfeDadosMsg>` +
      `</soap:Body>` +
      `</soap:Envelope>`;

    // 4) HTTPS agent com cert A1
    const { fileBuffer, password } =
      await this.certificates.getForIntegration(companyId);
    const httpsAgent = this.buildHttpsAgent(fileBuffer, password);

    // 5) POST
    let responseXml: string;
    try {
      const response = await axios.post<string>(url, soapEnvelope, {
        httpsAgent,
        headers: {
          'Content-Type':
            'application/soap+xml; charset=utf-8; action="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote"',
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

    // 6/7) Parse e extração
    return this.parseTransmissionResponse(responseXml);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

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

  private async parseTransmissionResponse(
    responseXml: string,
  ): Promise<TransmissaoResultado> {
    let parsed: SoapEnvelope;
    try {
      parsed = (await parseStringPromise(responseXml, {
        explicitArray: false,
      })) as SoapEnvelope;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'parse falhou';
      throw new BadRequestException(
        `Erro ao parsear resposta da SEFAZ: ${msg}`,
      );
    }

    // Tenta vários prefixos de namespace SOAP
    const body: SoapBody | undefined =
      parsed['soap:Envelope']?.['soap:Body'] ??
      parsed['soap12:Envelope']?.['soap12:Body'] ??
      parsed['s:Envelope']?.['s:Body'] ??
      parsed.Envelope?.Body;

    if (!body) {
      throw new BadRequestException(
        'Resposta SEFAZ sem envelope SOAP reconhecível',
      );
    }

    // O retEnviNFe pode estar dentro de nfeResultMsg ou direto no body
    const nfeResult = body.nfeResultMsg;
    const retEnviNFe: RetEnviNFe | undefined =
      typeof nfeResult === 'object' && nfeResult !== null
        ? nfeResult.retEnviNFe
        : body.retEnviNFe;

    if (!retEnviNFe) {
      throw new BadRequestException(
        'Resposta SEFAZ sem retEnviNFe — formato inesperado',
      );
    }

    const loteCStat = retEnviNFe.cStat ?? '';
    const loteXMotivo = retEnviNFe.xMotivo ?? '';

    // Em modo síncrono, retEnviNFe.protNFe.infProt traz o cStat real da nota
    const infProt = retEnviNFe.protNFe?.infProt;

    if (!infProt) {
      // Sem protNFe — devolve o cStat do lote (provável erro de schema/lote)
      return {
        cStat: loteCStat,
        xMotivo: loteXMotivo,
      };
    }

    const cStat = infProt.cStat ?? loteCStat;
    const xMotivo = infProt.xMotivo ?? loteXMotivo;
    const dhRecbto =
      infProt.dhRecbto != null && infProt.dhRecbto !== ''
        ? new Date(infProt.dhRecbto)
        : undefined;

    if (cStat === '100') {
      return {
        cStat,
        xMotivo,
        dhRecbto,
        protocolo: infProt.nProt,
        xmlProtNFe: this.serializeProtNFe(retEnviNFe.protNFe),
      };
    }

    return {
      cStat,
      xMotivo,
      dhRecbto,
    };
  }

  /**
   * Re-serializa o nó `<protNFe>` para string XML — usado para compor o
   * `<nfeProc>` final. Mantém os atributos (versao) e os campos do infProt.
   */
  private serializeProtNFe(protNFe: ProtNFe | undefined): string | undefined {
    if (!protNFe) return undefined;
    const builder = new Builder({
      headless: true,
      renderOpts: { pretty: false },
      xmldec: { version: '1.0', encoding: 'UTF-8' },
    });
    // O Builder do xml2js precisa do nome do root como key topo
    const xml = builder.buildObject({
      protNFe: {
        $: { versao: protNFe.$?.versao ?? '4.00' },
        infProt: protNFe.infProt ?? {},
      },
    });
    return xml;
  }
}
