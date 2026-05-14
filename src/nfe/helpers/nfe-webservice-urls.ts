// ─── URLs dos webservices NF-e por UF e ambiente ───────────────────────────
// Mapeamento das UFs autorizadoras (próprias) e das que delegam ao SVRS/SVAN.
// Fonte: Portal Nacional NF-e (Status WS) e manuais das SEFAZs estaduais.
// Atualizado para o layout 4.00.

export type Ambiente = 'PRODUCAO' | 'HOMOLOGACAO';

type ServiceKey = 'autorizacao' | 'evento' | 'inutilizacao';

interface WebserviceEndpoints {
  PRODUCAO: string;
  HOMOLOGACAO: string;
}

// ─── NFeAutorizacao4 ─────────────────────────────────────────────────────

// SEFAZ Virtual RS — autorizadora para AC, AL, AP, CE, DF, ES, PB, RJ, RN, RO, PI, RR, PA, SC, SE, TO.
const AUTORIZACAO_SVRS: WebserviceEndpoints = {
  HOMOLOGACAO:
    'https://nfe-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
  PRODUCAO:
    'https://nfe.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
};

// SEFAZ Virtual AN — autorizadora para MA.
const AUTORIZACAO_SVAN: WebserviceEndpoints = {
  HOMOLOGACAO:
    'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx',
  PRODUCAO:
    'https://www.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx',
};

const AUTORIZACAO_UF_URLS: Record<string, WebserviceEndpoints> = {
  AM: {
    HOMOLOGACAO:
      'https://homnfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4',
    PRODUCAO:
      'https://nfe.sefaz.am.gov.br/services2/services/NfeAutorizacao4',
  },
  BA: {
    HOMOLOGACAO:
      'https://hnfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
    PRODUCAO:
      'https://nfe.sefaz.ba.gov.br/webservices/NFeAutorizacao4/NFeAutorizacao4.asmx',
  },
  GO: {
    HOMOLOGACAO:
      'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
    PRODUCAO: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
  },
  MG: {
    HOMOLOGACAO:
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
    PRODUCAO: 'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4',
  },
  MS: {
    HOMOLOGACAO: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
    PRODUCAO: 'https://nfe.sefaz.ms.gov.br/ws/NFeAutorizacao4',
  },
  MT: {
    HOMOLOGACAO:
      'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4',
    PRODUCAO:
      'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeAutorizacao4',
  },
  PE: {
    HOMOLOGACAO:
      'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
    PRODUCAO:
      'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeAutorizacao4',
  },
  PR: {
    HOMOLOGACAO:
      'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4?wsdl',
    PRODUCAO: 'https://nfe.sefa.pr.gov.br/nfe/NFeAutorizacao4?wsdl',
  },
  RS: {
    HOMOLOGACAO:
      'https://nfe-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
    PRODUCAO:
      'https://nfe.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx',
  },
  SP: {
    HOMOLOGACAO:
      'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
    PRODUCAO: 'https://nfe.fazenda.sp.gov.br/ws/nfeautorizacao4.asmx',
  },

  // UFs que delegam ao SVRS
  AC: AUTORIZACAO_SVRS,
  AL: AUTORIZACAO_SVRS,
  AP: AUTORIZACAO_SVRS,
  CE: AUTORIZACAO_SVRS,
  DF: AUTORIZACAO_SVRS,
  ES: AUTORIZACAO_SVRS,
  PB: AUTORIZACAO_SVRS,
  RJ: AUTORIZACAO_SVRS,
  RN: AUTORIZACAO_SVRS,
  RO: AUTORIZACAO_SVRS,
  PI: AUTORIZACAO_SVRS,
  RR: AUTORIZACAO_SVRS,
  PA: AUTORIZACAO_SVRS,
  SC: AUTORIZACAO_SVRS,
  SE: AUTORIZACAO_SVRS,
  TO: AUTORIZACAO_SVRS,

  // UFs que delegam ao SVAN
  MA: AUTORIZACAO_SVAN,
};

// ─── NFeRecepcaoEvento4 (cancelamento, CC-e) ──────────────────────────────

const EVENTO_SVRS: WebserviceEndpoints = {
  HOMOLOGACAO:
    'https://nfe-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
  PRODUCAO:
    'https://nfe.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
};

const EVENTO_SVAN: WebserviceEndpoints = {
  HOMOLOGACAO:
    'https://hom.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  PRODUCAO:
    'https://www.sefazvirtual.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
};

const EVENTO_UF_URLS: Record<string, WebserviceEndpoints> = {
  AM: {
    HOMOLOGACAO:
      'https://homnfe.sefaz.am.gov.br/services2/services/RecepcaoEvento4',
    PRODUCAO:
      'https://nfe.sefaz.am.gov.br/services2/services/RecepcaoEvento4',
  },
  BA: {
    HOMOLOGACAO:
      'https://hnfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
    PRODUCAO:
      'https://nfe.sefaz.ba.gov.br/webservices/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx',
  },
  GO: {
    HOMOLOGACAO:
      'https://homolog.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
    PRODUCAO: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
  },
  MG: {
    HOMOLOGACAO:
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
    PRODUCAO:
      'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4',
  },
  MS: {
    HOMOLOGACAO: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
    PRODUCAO: 'https://nfe.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4',
  },
  MT: {
    HOMOLOGACAO:
      'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/RecepcaoEvento4',
    PRODUCAO:
      'https://nfe.sefaz.mt.gov.br/nfews/v2/services/RecepcaoEvento4',
  },
  PE: {
    HOMOLOGACAO:
      'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4',
    PRODUCAO:
      'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeRecepcaoEvento4',
  },
  PR: {
    HOMOLOGACAO:
      'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4?wsdl',
    PRODUCAO: 'https://nfe.sefa.pr.gov.br/nfe/NFeRecepcaoEvento4?wsdl',
  },
  RS: {
    HOMOLOGACAO:
      'https://nfe-homologacao.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
    PRODUCAO:
      'https://nfe.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx',
  },
  SP: {
    HOMOLOGACAO:
      'https://homologacao.nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
    PRODUCAO: 'https://nfe.fazenda.sp.gov.br/ws/nferecepcaoevento4.asmx',
  },

  // UFs que delegam ao SVRS
  AC: EVENTO_SVRS,
  AL: EVENTO_SVRS,
  AP: EVENTO_SVRS,
  CE: EVENTO_SVRS,
  DF: EVENTO_SVRS,
  ES: EVENTO_SVRS,
  PB: EVENTO_SVRS,
  RJ: EVENTO_SVRS,
  RN: EVENTO_SVRS,
  RO: EVENTO_SVRS,
  PI: EVENTO_SVRS,
  RR: EVENTO_SVRS,
  PA: EVENTO_SVRS,
  SC: EVENTO_SVRS,
  SE: EVENTO_SVRS,
  TO: EVENTO_SVRS,

  // UFs que delegam ao SVAN
  MA: EVENTO_SVAN,
};

// ─── NFeInutilizacao4 ────────────────────────────────────────────────────

const INUTILIZACAO_SVRS: WebserviceEndpoints = {
  HOMOLOGACAO:
    'https://nfe-homologacao.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
  PRODUCAO:
    'https://nfe.svrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
};

const INUTILIZACAO_SVAN: WebserviceEndpoints = {
  HOMOLOGACAO:
    'https://hom.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx',
  PRODUCAO:
    'https://www.sefazvirtual.fazenda.gov.br/NFeInutilizacao4/NFeInutilizacao4.asmx',
};

const INUTILIZACAO_UF_URLS: Record<string, WebserviceEndpoints> = {
  AM: {
    HOMOLOGACAO:
      'https://homnfe.sefaz.am.gov.br/services2/services/NfeInutilizacao4',
    PRODUCAO:
      'https://nfe.sefaz.am.gov.br/services2/services/NfeInutilizacao4',
  },
  BA: {
    HOMOLOGACAO:
      'https://hnfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx',
    PRODUCAO:
      'https://nfe.sefaz.ba.gov.br/webservices/NFeInutilizacao4/NFeInutilizacao4.asmx',
  },
  GO: {
    HOMOLOGACAO:
      'https://homolog.sefaz.go.gov.br/nfe/services/NFeInutilizacao4',
    PRODUCAO: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeInutilizacao4',
  },
  MG: {
    HOMOLOGACAO:
      'https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4',
    PRODUCAO:
      'https://nfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4',
  },
  MS: {
    HOMOLOGACAO: 'https://hom.nfe.sefaz.ms.gov.br/ws/NFeInutilizacao4',
    PRODUCAO: 'https://nfe.sefaz.ms.gov.br/ws/NFeInutilizacao4',
  },
  MT: {
    HOMOLOGACAO:
      'https://homologacao.sefaz.mt.gov.br/nfews/v2/services/NfeInutilizacao4',
    PRODUCAO:
      'https://nfe.sefaz.mt.gov.br/nfews/v2/services/NfeInutilizacao4',
  },
  PE: {
    HOMOLOGACAO:
      'https://nfehomolog.sefaz.pe.gov.br/nfe-service/services/NFeInutilizacao4',
    PRODUCAO:
      'https://nfe.sefaz.pe.gov.br/nfe-service/services/NFeInutilizacao4',
  },
  PR: {
    HOMOLOGACAO:
      'https://homologacao.nfe.sefa.pr.gov.br/nfe/NFeInutilizacao4?wsdl',
    PRODUCAO: 'https://nfe.sefa.pr.gov.br/nfe/NFeInutilizacao4?wsdl',
  },
  RS: {
    HOMOLOGACAO:
      'https://nfe-homologacao.sefazrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
    PRODUCAO:
      'https://nfe.sefazrs.rs.gov.br/ws/nfeinutilizacao/nfeinutilizacao4.asmx',
  },
  SP: {
    HOMOLOGACAO:
      'https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx',
    PRODUCAO: 'https://nfe.fazenda.sp.gov.br/ws/nfeinutilizacao4.asmx',
  },

  // UFs que delegam ao SVRS
  AC: INUTILIZACAO_SVRS,
  AL: INUTILIZACAO_SVRS,
  AP: INUTILIZACAO_SVRS,
  CE: INUTILIZACAO_SVRS,
  DF: INUTILIZACAO_SVRS,
  ES: INUTILIZACAO_SVRS,
  PB: INUTILIZACAO_SVRS,
  RJ: INUTILIZACAO_SVRS,
  RN: INUTILIZACAO_SVRS,
  RO: INUTILIZACAO_SVRS,
  PI: INUTILIZACAO_SVRS,
  RR: INUTILIZACAO_SVRS,
  PA: INUTILIZACAO_SVRS,
  SC: INUTILIZACAO_SVRS,
  SE: INUTILIZACAO_SVRS,
  TO: INUTILIZACAO_SVRS,

  // UFs que delegam ao SVAN
  MA: INUTILIZACAO_SVAN,
};

// ─── Resolver genérico ────────────────────────────────────────────────────

const SERVICE_LABELS: Record<ServiceKey, string> = {
  autorizacao: 'NFeAutorizacao4',
  evento: 'NFeRecepcaoEvento4',
  inutilizacao: 'NFeInutilizacao4',
};

const SERVICE_MAPS: Record<ServiceKey, Record<string, WebserviceEndpoints>> = {
  autorizacao: AUTORIZACAO_UF_URLS,
  evento: EVENTO_UF_URLS,
  inutilizacao: INUTILIZACAO_UF_URLS,
};

function getServiceUrl(
  service: ServiceKey,
  uf: string,
  ambiente: Ambiente,
): string {
  const endpoints = SERVICE_MAPS[service][uf];
  if (!endpoints) {
    throw new Error(
      `UF '${uf}' não possui webservice ${SERVICE_LABELS[service]} mapeado`,
    );
  }
  return endpoints[ambiente];
}

/**
 * Retorna a URL do webservice `NFeAutorizacao4` para a UF + ambiente.
 * Lança `Error` se a UF não estiver mapeada.
 */
export function getNfeAutorizacao4Url(uf: string, ambiente: Ambiente): string {
  return getServiceUrl('autorizacao', uf, ambiente);
}

/**
 * Retorna a URL do webservice `NFeRecepcaoEvento4` para a UF + ambiente.
 * Usado para cancelamento (tpEvento 110111) e carta de correção (110110).
 */
export function getNfeRecepcaoEvento4Url(
  uf: string,
  ambiente: Ambiente,
): string {
  return getServiceUrl('evento', uf, ambiente);
}

/**
 * Retorna a URL do webservice `NFeInutilizacao4` para a UF + ambiente.
 * Usado para inutilização de faixa de numeração.
 */
export function getNfeInutilizacao4Url(
  uf: string,
  ambiente: Ambiente,
): string {
  return getServiceUrl('inutilizacao', uf, ambiente);
}
