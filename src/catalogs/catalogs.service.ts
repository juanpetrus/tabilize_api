import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../database/index.js';

interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

interface SearchCnaeOptions extends PaginationOptions {
  q?: string;
  secao?: string;
}

interface SearchNcmOptions extends PaginationOptions {
  q?: string;
  capitulo?: string;
}

interface SearchCfopOptions extends PaginationOptions {
  q?: string;
  natureza?: 'ENTRADA' | 'SAIDA';
  grupo?: string;
}

interface SearchMunicipiosOptions extends PaginationOptions {
  q?: string;
  uf?: string;
}

const UFS = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapá' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceará' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espírito Santo' },
  { sigla: 'GO', nome: 'Goiás' },
  { sigla: 'MA', nome: 'Maranhão' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Pará' },
  { sigla: 'PB', nome: 'Paraíba' },
  { sigla: 'PR', nome: 'Paraná' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piauí' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondônia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'São Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
] as const;

@Injectable()
export class CatalogsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── CNAE ────────────────────────────────────────────────────────────────

  async searchCnae(options: SearchCnaeOptions = {}) {
    const { page, pageSize, skip, take } = normalizePagination(options);
    const q = options.q?.trim();
    const secao = options.secao?.trim();

    const where: Prisma.CnaeCodeWhereInput = {
      isActive: true,
      ...(secao ? { secao } : {}),
      ...(q
        ? {
            OR: [
              { codigo: { contains: q } },
              { descricao: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.cnaeCode.count({ where }),
      this.prisma.cnaeCode.findMany({
        where,
        select: {
          codigo: true,
          descricao: true,
          secao: true,
          secaoDesc: true,
        },
        orderBy: { codigo: 'asc' },
        skip,
        take,
      }),
    ]);

    return { items, pagination: buildPagination(page, pageSize, total) };
  }

  // ─── NCM ─────────────────────────────────────────────────────────────────

  async searchNcm(options: SearchNcmOptions = {}) {
    const { page, pageSize, skip, take } = normalizePagination(options);
    const q = options.q?.trim();
    const capitulo = options.capitulo?.trim();

    const where: Prisma.NcmCodeWhereInput = {
      isActive: true,
      ...(capitulo ? { capitulo } : {}),
      ...(q
        ? {
            OR: [
              { codigo: { startsWith: q.replace(/\D/g, '') } },
              { descricao: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.ncmCode.count({ where }),
      this.prisma.ncmCode.findMany({
        where,
        select: {
          codigo: true,
          descricao: true,
          capitulo: true,
        },
        orderBy: { codigo: 'asc' },
        skip,
        take,
      }),
    ]);

    return { items, pagination: buildPagination(page, pageSize, total) };
  }

  // ─── CFOP ────────────────────────────────────────────────────────────────

  async searchCfop(options: SearchCfopOptions = {}) {
    const { page, pageSize, skip, take } = normalizePagination(options);
    const q = options.q?.trim();
    const natureza = options.natureza;
    const grupo = options.grupo?.trim();

    const where: Prisma.CfopCodeWhereInput = {
      isActive: true,
      ...(natureza ? { natureza } : {}),
      ...(grupo ? { grupo } : {}),
      ...(q
        ? {
            OR: [
              { codigo: { contains: q } },
              { descricao: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.cfopCode.count({ where }),
      this.prisma.cfopCode.findMany({
        where,
        select: {
          codigo: true,
          descricao: true,
          natureza: true,
          grupo: true,
        },
        orderBy: { codigo: 'asc' },
        skip,
        take,
      }),
    ]);

    return { items, pagination: buildPagination(page, pageSize, total) };
  }

  // ─── CST ICMS (lista completa — tabela pequena) ─────────────────────────

  async listCstIcms() {
    return this.prisma.cstIcmsCode.findMany({
      where: { isActive: true },
      select: { codigo: true, descricao: true, observacao: true },
      orderBy: { codigo: 'asc' },
    });
  }

  // ─── CSOSN (lista completa — tabela pequena) ────────────────────────────

  async listCsosn() {
    return this.prisma.csosnCode.findMany({
      where: { isActive: true },
      select: { codigo: true, descricao: true, observacao: true },
      orderBy: { codigo: 'asc' },
    });
  }

  // ─── Municípios IBGE ─────────────────────────────────────────────────────

  async searchMunicipios(options: SearchMunicipiosOptions = {}) {
    const { page, pageSize, skip, take } = normalizePagination(options);
    const q = options.q?.trim();
    const uf = options.uf?.trim().toUpperCase();

    const where: Prisma.IbgeMunicipioWhereInput = {
      isActive: true,
      ...(uf ? { uf } : {}),
      ...(q
        ? {
            OR: [
              { codigo: { startsWith: q.replace(/\D/g, '') } },
              { nome: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      this.prisma.ibgeMunicipio.count({ where }),
      this.prisma.ibgeMunicipio.findMany({
        where,
        select: { codigo: true, nome: true, uf: true },
        orderBy: [{ uf: 'asc' }, { nome: 'asc' }],
        skip,
        take,
      }),
    ]);

    return { items, pagination: buildPagination(page, pageSize, total) };
  }

  // ─── UFs (hardcoded — 27 estados, nunca mudam) ───────────────────────────

  listUfs() {
    return UFS;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizePagination(options: PaginationOptions) {
  const page =
    Number.isFinite(options.page) && (options.page as number) > 0
      ? Math.trunc(options.page as number)
      : 1;
  const pageSize =
    Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
      ? Math.min(100, Math.trunc(options.pageSize as number))
      : 20;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

function buildPagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
