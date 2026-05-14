// ─── Helper de chave de acesso NF-e ────────────────────────────────────────
// Funções puras para geração de cNF, DV (módulo 11) e montagem da chave de 44 dígitos.
// Algoritmo oficial SEFAZ — Manual de Orientação do Contribuinte 7.0 / Anexo II.

/**
 * Mapeia sigla da UF para o código IBGE (cUF).
 * 27 entradas (26 estados + DF).
 */
export const UF_TO_CUF: Record<string, string> = {
  AC: '12',
  AL: '27',
  AP: '16',
  AM: '13',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MT: '51',
  MS: '50',
  MG: '31',
  PA: '15',
  PB: '25',
  PR: '41',
  PE: '26',
  PI: '22',
  RJ: '33',
  RN: '24',
  RS: '43',
  RO: '11',
  RR: '14',
  SC: '42',
  SP: '35',
  SE: '28',
  TO: '17',
};

/**
 * Gera 8 dígitos numéricos aleatórios (zero-padded). Não pode ser igual ao
 * nNF — caller é responsável por garantir essa regra (basta gerar novo se colidir).
 */
export function gerarCNF(): string {
  // Math.random() suficiente para cNF — o objetivo é apenas evitar duplicidade
  // dentro do mesmo dia/UF/série/CNPJ; não é segurança criptográfica.
  const n = Math.floor(Math.random() * 100_000_000);
  return n.toString().padStart(8, '0');
}

/**
 * Calcula DV da chave (módulo 11, pesos 2..9 cíclico da direita p/ esquerda).
 * Recebe os primeiros 43 dígitos e retorna 1 dígito como string.
 *
 * Regra: se o DV (11 - resto) for >= 10, vira 0.
 */
export function calcularDV(chave43: string): string {
  if (chave43.length !== 43 || !/^\d+$/.test(chave43)) {
    throw new Error('chave43 deve conter exatamente 43 dígitos');
  }

  let soma = 0;
  let peso = 2;
  for (let i = chave43.length - 1; i >= 0; i--) {
    const digito = Number(chave43[i]);
    soma += digito * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }

  const resto = soma % 11;
  const dv = 11 - resto;
  return (dv >= 10 ? 0 : dv).toString();
}

/**
 * Monta chave completa de 44 dígitos.
 *
 * Layout (43 + DV):
 *   cUF(2) + AAMM(4) + CNPJ(14) + mod(2) + serie(3) + nNF(9) + tpEmis(1) + cNF(8) + DV(1)
 */
export function montarChaveAcesso(params: {
  cUF: string;
  dhEmi: Date;
  cnpj: string;
  mod: string;
  serie: string;
  nNF: number;
  tpEmis: string;
  cNF: string;
}): string {
  const { cUF, dhEmi, cnpj, mod, serie, nNF, tpEmis, cNF } = params;

  if (cUF.length !== 2) throw new Error('cUF deve ter 2 dígitos');
  const cnpjLimpo = cnpj.replace(/\D/g, '');
  if (cnpjLimpo.length !== 14) throw new Error('CNPJ deve ter 14 dígitos');
  if (mod.length !== 2) throw new Error('mod deve ter 2 dígitos');
  if (tpEmis.length !== 1) throw new Error('tpEmis deve ter 1 dígito');
  if (cNF.length !== 8) throw new Error('cNF deve ter 8 dígitos');

  // AAMM = ano com 2 dígitos + mês com 2 dígitos
  const ano = dhEmi.getFullYear() % 100;
  const mes = dhEmi.getMonth() + 1;
  const aamm = `${ano.toString().padStart(2, '0')}${mes.toString().padStart(2, '0')}`;

  const seriePadded = serie.padStart(3, '0');
  const nNFPadded = nNF.toString().padStart(9, '0');

  const chave43 = `${cUF}${aamm}${cnpjLimpo}${mod}${seriePadded}${nNFPadded}${tpEmis}${cNF}`;
  if (chave43.length !== 43) {
    throw new Error(
      `chave43 com tamanho inválido: ${chave43.length} (esperado 43)`,
    );
  }

  const dv = calcularDV(chave43);
  return `${chave43}${dv}`;
}
