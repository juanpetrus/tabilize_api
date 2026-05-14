import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ─── NCM ───────────────────────────────────────────────────────────────────

interface BrasilApiNcm {
  codigo: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
}

async function seedNcm() {
  const path = resolve(process.cwd(), 'prisma/data/ncm.json');
  const raw = readFileSync(path, 'utf-8');
  const items = JSON.parse(raw) as BrasilApiNcm[];

  const hoje = new Date();
  const data = items
    .filter((n) => {
      // mantém só vigentes (data_fim == 9999-12-31 ou data_fim no futuro)
      const fim = new Date(n.data_fim);
      return fim >= hoje;
    })
    .map((n) => {
      const codigo = n.codigo.replace(/\D/g, '');
      return {
        codigo,
        descricao: n.descricao,
        capitulo: codigo.slice(0, 2),
        posicao: codigo.length >= 4 ? codigo.slice(0, 4) : codigo,
        subposicao: codigo.length >= 6 ? codigo.slice(0, 6) : codigo,
      };
    });

  const result = await prisma.ncmCode.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`NCM: inseridos ${result.count} de ${data.length}`);
}

// ─── Municípios IBGE ────────────────────────────────────────────────────────

interface IbgeUf {
  sigla: string;
}
interface IbgeMunicipio {
  id: number;
  nome: string;
  microrregiao: { mesorregiao: { UF: IbgeUf } } | null;
  'regiao-imediata'?: { 'regiao-intermediaria': { UF: IbgeUf } };
}

async function seedMunicipios() {
  const path = resolve(process.cwd(), 'prisma/data/municipios.json');
  const raw = readFileSync(path, 'utf-8');
  const items = JSON.parse(raw) as IbgeMunicipio[];

  const data = items.map((m) => {
    const uf =
      m.microrregiao?.mesorregiao.UF.sigla ??
      m['regiao-imediata']?.['regiao-intermediaria'].UF.sigla;
    if (!uf) throw new Error(`Município ${m.id} (${m.nome}) sem UF`);
    return { codigo: String(m.id), nome: m.nome, uf };
  });

  const result = await prisma.ibgeMunicipio.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`Municípios IBGE: inseridos ${result.count} de ${data.length}`);
}

// ─── CST ICMS (Regime Normal) ───────────────────────────────────────────────

const CST_ICMS = [
  ['00', 'Tributada integralmente'],
  ['10', 'Tributada e com cobrança do ICMS por substituição tributária'],
  ['20', 'Com redução de base de cálculo'],
  ['30', 'Isenta ou não tributada e com cobrança do ICMS por substituição tributária'],
  ['40', 'Isenta'],
  ['41', 'Não tributada'],
  ['50', 'Suspensão'],
  ['51', 'Diferimento'],
  ['60', 'ICMS cobrado anteriormente por substituição tributária'],
  ['70', 'Com redução de base de cálculo e cobrança do ICMS por substituição tributária'],
  ['90', 'Outras'],
];

async function seedCstIcms() {
  const data = CST_ICMS.map(([codigo, descricao]) => ({ codigo, descricao }));
  const result = await prisma.cstIcmsCode.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`CST ICMS: inseridos ${result.count} de ${data.length}`);
}

// ─── CSOSN (Simples Nacional) ───────────────────────────────────────────────

const CSOSN = [
  ['101', 'Tributada pelo Simples Nacional com permissão de crédito'],
  ['102', 'Tributada pelo Simples Nacional sem permissão de crédito'],
  ['103', 'Isenção do ICMS no Simples Nacional para faixa de receita bruta'],
  ['201', 'Tributada pelo Simples Nacional com permissão de crédito e com cobrança do ICMS por substituição tributária'],
  ['202', 'Tributada pelo Simples Nacional sem permissão de crédito e com cobrança do ICMS por substituição tributária'],
  ['203', 'Isenção do ICMS no Simples Nacional para faixa de receita bruta e com cobrança do ICMS por substituição tributária'],
  ['300', 'Imune'],
  ['400', 'Não tributada pelo Simples Nacional'],
  ['500', 'ICMS cobrado anteriormente por substituição tributária (substituído) ou por antecipação'],
  ['900', 'Outros'],
];

async function seedCsosn() {
  const data = CSOSN.map(([codigo, descricao]) => ({ codigo, descricao }));
  const result = await prisma.csosnCode.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`CSOSN: inseridos ${result.count} de ${data.length}`);
}

// ─── CFOP (principais — cobrem 90% dos casos do contador) ──────────────────

// Estrutura: [codigo, descricao, aplicacao?]
const CFOPS: Array<[string, string, string?]> = [
  // ── Grupo 1: Entradas/Aquisições do mesmo estado ──
  ['1101', 'Compra para industrialização ou produção rural'],
  ['1102', 'Compra para comercialização'],
  ['1111', 'Compra para industrialização de mercadoria recebida anteriormente em consignação industrial'],
  ['1113', 'Compra para comercialização, de mercadoria recebida anteriormente em consignação mercantil'],
  ['1116', 'Compra para industrialização ou produção rural originada de encomenda para recebimento futuro'],
  ['1117', 'Compra para comercialização originada de encomenda para recebimento futuro'],
  ['1118', 'Compra de mercadoria para comercialização pelo adquirente originário, entregue pelo vendedor remetente ao destinatário, em venda à ordem'],
  ['1120', 'Compra para industrialização, em venda à ordem, já recebida do vendedor remetente'],
  ['1121', 'Compra para comercialização, em venda à ordem, já recebida do vendedor remetente'],
  ['1122', 'Compra para industrialização em que a mercadoria foi remetida pelo fornecedor ao industrializador sem transitar pelo estabelecimento adquirente'],
  ['1124', 'Industrialização efetuada por outra empresa'],
  ['1125', 'Industrialização efetuada por outra empresa quando a mercadoria remetida para utilização no processo de industrialização não transitou pelo estabelecimento adquirente da mercadoria'],
  ['1126', 'Compra para utilização na prestação de serviço'],
  ['1128', 'Compra de energia elétrica para utilização no processo de industrialização'],
  ['1152', 'Transferência para industrialização ou produção rural'],
  ['1201', 'Devolução de venda de produção do estabelecimento'],
  ['1202', 'Devolução de venda de mercadoria adquirida ou recebida de terceiros'],
  ['1203', 'Devolução de venda de produção do estabelecimento, destinada à Zona Franca de Manaus ou Áreas de Livre Comércio'],
  ['1411', 'Devolução de venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária'],
  ['1412', 'Devolução de venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária'],
  ['1551', 'Compra de bem para o ativo imobilizado'],
  ['1552', 'Transferência de bem do ativo imobilizado'],
  ['1556', 'Compra de material para uso ou consumo'],
  ['1557', 'Transferência de material para uso ou consumo'],
  ['1601', 'Recebimento, por transferência, de crédito de ICMS'],
  ['1602', 'Recebimento, por transferência, de saldo credor de ICMS, de outro estabelecimento da mesma empresa'],
  ['1604', 'Lançamento do crédito relativo à compra de bem para o ativo imobilizado'],
  ['1605', 'Recebimento, por transferência, de saldo devedor de ICMS de outro estabelecimento da mesma empresa'],
  ['1902', 'Retorno de mercadoria remetida para industrialização'],
  ['1903', 'Entrada de mercadoria remetida para industrialização e não aplicada no referido processo'],
  ['1904', 'Retorno de remessa para venda fora do estabelecimento'],
  ['1906', 'Retorno de mercadoria remetida para industrialização por outra empresa'],
  ['1908', 'Entrada de bem por conta de contrato de comodato'],
  ['1909', 'Retorno de bem remetido por conta de contrato de comodato'],
  ['1910', 'Entrada de bonificação, doação ou brinde'],
  ['1911', 'Entrada de amostra grátis'],
  ['1913', 'Retorno de mercadoria remetida para exposição ou feira'],
  ['1915', 'Entrada de mercadoria ou bem recebido para conserto ou reparo'],
  ['1916', 'Retorno de mercadoria ou bem remetido para conserto ou reparo'],
  ['1949', 'Outra entrada de mercadoria ou prestação de serviço não especificada'],

  // ── Grupo 2: Entradas/Aquisições de outras UFs ──
  ['2101', 'Compra para industrialização ou produção rural'],
  ['2102', 'Compra para comercialização'],
  ['2113', 'Compra para comercialização, de mercadoria recebida anteriormente em consignação mercantil'],
  ['2116', 'Compra para industrialização ou produção rural originada de encomenda para recebimento futuro'],
  ['2117', 'Compra para comercialização originada de encomenda para recebimento futuro'],
  ['2118', 'Compra de mercadoria para comercialização pelo adquirente originário, entregue pelo vendedor remetente ao destinatário, em venda à ordem'],
  ['2124', 'Industrialização efetuada por outra empresa'],
  ['2126', 'Compra para utilização na prestação de serviço'],
  ['2152', 'Transferência para industrialização ou produção rural'],
  ['2201', 'Devolução de venda de produção do estabelecimento'],
  ['2202', 'Devolução de venda de mercadoria adquirida ou recebida de terceiros'],
  ['2411', 'Devolução de venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária'],
  ['2412', 'Devolução de venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária'],
  ['2551', 'Compra de bem para o ativo imobilizado'],
  ['2556', 'Compra de material para uso ou consumo'],
  ['2902', 'Retorno de mercadoria remetida para industrialização'],
  ['2910', 'Entrada de bonificação, doação ou brinde'],
  ['2949', 'Outra entrada de mercadoria ou prestação de serviço não especificada'],

  // ── Grupo 3: Entradas/Aquisições do exterior ──
  ['3101', 'Compra para industrialização ou produção rural'],
  ['3102', 'Compra para comercialização'],
  ['3126', 'Compra para utilização na prestação de serviço'],
  ['3127', 'Compra para industrialização sob o regime de drawback'],
  ['3201', 'Devolução de venda de produção do estabelecimento'],
  ['3202', 'Devolução de venda de mercadoria adquirida ou recebida de terceiros'],
  ['3211', 'Devolução de venda de produção do estabelecimento sob o regime de drawback'],
  ['3551', 'Compra de bem para o ativo imobilizado'],
  ['3556', 'Compra de material para uso ou consumo'],
  ['3949', 'Outra entrada de mercadoria ou prestação de serviço não especificada'],

  // ── Grupo 5: Saídas/Prestações para o mesmo estado ──
  ['5101', 'Venda de produção do estabelecimento'],
  ['5102', 'Venda de mercadoria adquirida ou recebida de terceiros'],
  ['5103', 'Venda de produção do estabelecimento, efetuada fora do estabelecimento'],
  ['5104', 'Venda de mercadoria adquirida ou recebida de terceiros, efetuada fora do estabelecimento'],
  ['5111', 'Venda de produção do estabelecimento remetida anteriormente em consignação industrial'],
  ['5113', 'Venda de mercadoria, de produção do estabelecimento, remetida anteriormente em consignação mercantil'],
  ['5114', 'Venda de mercadoria, adquirida ou recebida de terceiros, remetida anteriormente em consignação mercantil'],
  ['5115', 'Venda de mercadoria adquirida ou recebida de terceiros, recebida anteriormente em consignação mercantil'],
  ['5116', 'Venda de produção do estabelecimento originada de encomenda para entrega futura'],
  ['5117', 'Venda de mercadoria adquirida ou recebida de terceiros, originada de encomenda para entrega futura'],
  ['5118', 'Venda de produção do estabelecimento entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem'],
  ['5119', 'Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem'],
  ['5120', 'Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário pelo vendedor remetente, em venda à ordem'],
  ['5122', 'Venda de produção do estabelecimento remetida para industrialização, por conta e ordem do adquirente, sem transitar pelo estabelecimento do adquirente'],
  ['5124', 'Industrialização efetuada para outra empresa'],
  ['5152', 'Transferência de produção do estabelecimento'],
  ['5201', 'Devolução de compra para industrialização ou produção rural'],
  ['5202', 'Devolução de compra para comercialização'],
  ['5208', 'Devolução de mercadoria recebida em transferência para industrialização ou produção rural'],
  ['5209', 'Devolução de mercadoria recebida em transferência para comercialização'],
  ['5401', 'Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária, na condição de contribuinte substituto'],
  ['5402', 'Venda de produção do estabelecimento de produto sujeito ao regime de substituição tributária, em operação entre contribuintes substitutos do mesmo produto'],
  ['5403', 'Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituto'],
  ['5405', 'Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituído'],
  ['5409', 'Venda de mercadoria adquirida ou recebida de terceiros, sujeita ao regime de substituição tributária, em operação interestadual destinada a consumidor final'],
  ['5411', 'Devolução de compra para industrialização ou produção rural em operação com mercadoria sujeita ao regime de substituição tributária'],
  ['5412', 'Devolução de compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária'],
  ['5551', 'Venda de bem do ativo imobilizado'],
  ['5552', 'Transferência de bem do ativo imobilizado'],
  ['5556', 'Devolução de compra de material de uso ou consumo'],
  ['5557', 'Transferência de material de uso ou consumo'],
  ['5901', 'Remessa para industrialização por encomenda'],
  ['5902', 'Retorno de mercadoria utilizada na industrialização por encomenda'],
  ['5903', 'Retorno de mercadoria recebida para industrialização e não aplicada no referido processo'],
  ['5904', 'Remessa para venda fora do estabelecimento'],
  ['5910', 'Remessa em bonificação, doação ou brinde'],
  ['5911', 'Remessa de amostra grátis'],
  ['5912', 'Remessa de mercadoria ou bem para demonstração'],
  ['5913', 'Retorno de mercadoria ou bem recebido para demonstração'],
  ['5914', 'Remessa de mercadoria ou bem para exposição ou feira'],
  ['5915', 'Remessa de mercadoria ou bem para conserto ou reparo'],
  ['5916', 'Retorno de mercadoria ou bem recebido para conserto ou reparo'],
  ['5917', 'Remessa de mercadoria em consignação mercantil ou industrial'],
  ['5949', 'Outra saída de mercadoria ou prestação de serviço não especificado'],

  // ── Grupo 6: Saídas/Prestações para outras UFs ──
  ['6101', 'Venda de produção do estabelecimento'],
  ['6102', 'Venda de mercadoria adquirida ou recebida de terceiros'],
  ['6103', 'Venda de produção do estabelecimento, efetuada fora do estabelecimento'],
  ['6104', 'Venda de mercadoria adquirida ou recebida de terceiros, efetuada fora do estabelecimento'],
  ['6107', 'Venda de produção do estabelecimento, destinada a não contribuinte'],
  ['6108', 'Venda de mercadoria adquirida ou recebida de terceiros, destinada a não contribuinte'],
  ['6116', 'Venda de produção do estabelecimento originada de encomenda para entrega futura'],
  ['6117', 'Venda de mercadoria adquirida ou recebida de terceiros, originada de encomenda para entrega futura'],
  ['6118', 'Venda de produção do estabelecimento entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem'],
  ['6119', 'Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário por conta e ordem do adquirente originário, em venda à ordem'],
  ['6120', 'Venda de mercadoria adquirida ou recebida de terceiros entregue ao destinatário pelo vendedor remetente, em venda à ordem'],
  ['6152', 'Transferência de produção do estabelecimento'],
  ['6201', 'Devolução de compra para industrialização ou produção rural'],
  ['6202', 'Devolução de compra para comercialização'],
  ['6401', 'Venda de produção do estabelecimento em operação com produto sujeito ao regime de substituição tributária, na condição de contribuinte substituto'],
  ['6402', 'Venda de produção do estabelecimento de produto sujeito ao regime de substituição tributária, em operação entre contribuintes substitutos do mesmo produto'],
  ['6403', 'Venda de mercadoria adquirida ou recebida de terceiros em operação com mercadoria sujeita ao regime de substituição tributária, na condição de contribuinte substituto'],
  ['6404', 'Venda de mercadoria adquirida ou recebida de terceiros sujeita ao regime de substituição tributária, na condição de contribuinte substituído'],
  ['6411', 'Devolução de compra para industrialização ou produção rural em operação com mercadoria sujeita ao regime de substituição tributária'],
  ['6412', 'Devolução de compra para comercialização em operação com mercadoria sujeita ao regime de substituição tributária'],
  ['6551', 'Venda de bem do ativo imobilizado'],
  ['6552', 'Transferência de bem do ativo imobilizado'],
  ['6556', 'Devolução de compra de material de uso ou consumo'],
  ['6910', 'Remessa em bonificação, doação ou brinde'],
  ['6911', 'Remessa de amostra grátis'],
  ['6915', 'Remessa de mercadoria ou bem para conserto ou reparo'],
  ['6916', 'Retorno de mercadoria ou bem recebido para conserto ou reparo'],
  ['6949', 'Outra saída de mercadoria ou prestação de serviço não especificado'],

  // ── Grupo 7: Saídas/Prestações para o exterior ──
  ['7101', 'Venda de produção do estabelecimento'],
  ['7102', 'Venda de mercadoria adquirida ou recebida de terceiros'],
  ['7105', 'Venda de produção do estabelecimento, que não deva por ele transitar'],
  ['7106', 'Venda de mercadoria adquirida ou recebida de terceiros, que não deva por ele transitar'],
  ['7127', 'Venda de produção do estabelecimento sob o regime de drawback'],
  ['7201', 'Devolução de compra para industrialização ou produção rural'],
  ['7202', 'Devolução de compra para comercialização'],
  ['7211', 'Devolução de compras para industrialização sob o regime de drawback'],
  ['7501', 'Exportação de mercadorias recebidas com fim específico de exportação'],
  ['7551', 'Venda de bem do ativo imobilizado'],
  ['7949', 'Outra saída de mercadoria ou prestação de serviço não especificado'],
];

async function seedCfop() {
  const data = CFOPS.map(([codigo, descricao, aplicacao]) => {
    const grupo = codigo[0];
    const natureza = ['1', '2', '3'].includes(grupo) ? 'ENTRADA' : 'SAIDA';
    return { codigo, descricao, grupo, natureza, aplicacao: aplicacao ?? null };
  });
  const result = await prisma.cfopCode.createMany({
    data,
    skipDuplicates: true,
  });
  console.log(`CFOP: inseridos ${result.count} de ${data.length}`);
}

// ─── Run ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Iniciando seed de catálogos Fase 2...\n');
  await seedNcm();
  await seedMunicipios();
  await seedCstIcms();
  await seedCsosn();
  await seedCfop();
  console.log('\nConcluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
