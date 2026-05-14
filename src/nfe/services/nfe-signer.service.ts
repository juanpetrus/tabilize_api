import { BadRequestException, Injectable } from '@nestjs/common';
import * as forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { CertificatesService } from '../../certificates/certificates.service.js';

/**
 * Resultado do parse do PKCS12: chave privada e certificado em formato PEM,
 * mais o certificado em base64 puro (sem header/footer e quebras de linha) — usado
 * no `<X509Certificate>` do KeyInfo.
 */
interface ParsedCert {
  privateKeyPem: string;
  certPem: string;
  certBase64: string;
}

/**
 * Parâmetros para assinatura XMLDSig genérica.
 *
 * - `uri`: valor do atributo `Id` referenciado, incluindo prefixo `#`
 *   (ex.: `#NFe35240100...`, `#ID110111352401...`, `#ID3535...`).
 * - `xpath`: localizador do elemento a ser assinado e onde a `<Signature>`
 *   será inserida (após o nó). Use `local-name()` para ignorar namespaces.
 */
export interface NfeSignParams {
  xml: string;
  uri: string;
  xpath: string;
  companyId: string;
}

@Injectable()
export class NfeSignerService {
  constructor(private readonly certificates: CertificatesService) {}

  /**
   * Assina um XML usando XMLDSig (RSA-SHA1 / C14N / enveloped).
   *
   * O nó referenciado é determinado por `params.xpath`, e a `<Signature>`
   * é injetada como irmã desse nó, conforme exige a SEFAZ tanto para
   * `<infNFe>`, quanto para `<infEvento>` e `<infInut>`.
   */
  async sign(params: NfeSignParams): Promise<string> {
    const { xml, uri, xpath, companyId } = params;

    const { fileBuffer, password } =
      await this.certificates.getForIntegration(companyId);

    const parsed = this.parsePkcs12(fileBuffer, password);

    const sig = new SignedXml({
      privateKey: parsed.privateKeyPem,
      publicCert: parsed.certPem,
      signatureAlgorithm: 'http://www.w3.org/2000/09/xmldsig#rsa-sha1',
      canonicalizationAlgorithm:
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      getKeyInfoContent: () =>
        `<X509Data><X509Certificate>${parsed.certBase64}</X509Certificate></X509Data>`,
    });

    sig.addReference({
      xpath,
      transforms: [
        'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
        'http://www.w3.org/TR/2001/REC-xml-c14n-20010315',
      ],
      digestAlgorithm: 'http://www.w3.org/2000/09/xmldsig#sha1',
      uri,
    });

    sig.computeSignature(xml, {
      location: {
        reference: xpath,
        action: 'after',
      },
    });

    return sig.getSignedXml();
  }

  /**
   * Extrai chave privada + certificado X.509 do arquivo .pfx (PKCS#12).
   * Espelha o `buildHttpsAgent` do SefazService.
   */
  private parsePkcs12(fileBuffer: Buffer, password: string): ParsedCert {
    let p12Asn1: forge.asn1.Asn1;
    try {
      p12Asn1 = forge.asn1.fromDer(fileBuffer.toString('binary'));
    } catch {
      throw new BadRequestException(
        'Arquivo de certificado inválido ou corrompido',
      );
    }

    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    } catch {
      throw new BadRequestException('Senha do certificado incorreta');
    }

    const keyBags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
    const certificate = certBags[forge.pki.oids.certBag]?.[0]?.cert;

    if (!privateKey || !certificate) {
      throw new BadRequestException('Certificado inválido ou corrompido');
    }

    const privateKeyPem = forge.pki.privateKeyToPem(privateKey);
    const certPem = forge.pki.certificateToPem(certificate);

    // Base64 puro do DER do certificado (sem header/footer/quebras de linha) — exigido pelo XMLDSig.
    const certDer = forge.asn1
      .toDer(forge.pki.certificateToAsn1(certificate))
      .getBytes();
    const certBase64 = forge.util.encode64(certDer);

    return { privateKeyPem, certPem, certBase64 };
  }
}
