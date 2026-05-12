import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateLicenseDto } from './dto/create-license.dto.js';
import { UpdateLicenseDto } from './dto/update-license.dto.js';
import { RenewLicenseDto } from './dto/renew-license.dto.js';
import { LicenseType, LicenseStatus } from '../../generated/prisma/enums.js';
import { Prisma } from '../../generated/prisma/client.js';

// Rótulos padrão por tipo (usados como `name` quando o caller não informa)
const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  ALVARA_FUNCIONAMENTO: 'Alvará de Funcionamento',
  BOMBEIROS_AVCB: 'AVCB / CLCB (Corpo de Bombeiros)',
  SANITARIA: 'Licença Sanitária',
  AMBIENTAL: 'Licença Ambiental',
  INSCRICAO_MUNICIPAL: 'Inscrição Municipal',
  INSCRICAO_ESTADUAL: 'Inscrição Estadual',
  JUNTA_COMERCIAL: 'Registro na Junta Comercial',
  CONSELHO_CLASSE: 'Registro em Conselho de Classe',
  OUTRO: 'Outro',
};

// Janela (em dias) padrão para considerar uma licença "vencendo em breve"
const EXPIRING_SOON_DAYS = 30;

const ALL_STATUSES: LicenseStatus[] = [
  'PENDING',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'CANCELLED',
];

// Filtros da listagem "por empresa" (visão de gestão)
export type LicenseCompanyFilter =
  | 'with'
  | 'without'
  | 'has_expired'
  | 'has_expiring';

// "Saúde" da legalização de uma empresa, derivada das licenças atuais
export type LicenseCompanyHealth = 'none' | 'ok' | 'attention' | 'critical';

// Campos expostos no portal do cliente (sem dados internos)
const CLIENT_LICENSE_SELECT: Prisma.LicenseSelect = {
  id: true,
  type: true,
  name: true,
  status: true,
  issuingBody: true,
  number: true,
  issueDate: true,
  expirationDate: true,
  fileName: true,
  updatedAt: true,
};

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── Staff: criar licença ──────────────────────────────────────────────────

  async create(
    teamId: string,
    companyId: string,
    userId: string,
    dto: CreateLicenseDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const name = this.resolveName(dto.type, dto.name);

    return this.prisma.license.create({
      data: {
        companyId,
        type: dto.type,
        name,
        issuingBody: dto.issuingBody,
        number: dto.number,
        protocolNumber: dto.protocolNumber,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : null,
        notes: dto.notes,
        ...(this.resolveStatusOnCreate(dto)
          ? { status: this.resolveStatusOnCreate(dto)! }
          : {}),
      },
    });
  }

  // ─── Staff: visão por empresa (lista todas as empresas + resumo de licenças) ─

  async listCompanies(
    teamId: string,
    userId: string,
    options: {
      search?: string;
      filter?: LicenseCompanyFilter;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    await this.ensureMember(teamId, userId);

    const search = options.search?.trim();
    const page =
      Number.isFinite(options.page) && (options.page as number) > 0
        ? Math.trunc(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
        ? Math.min(100, Math.trunc(options.pageSize as number))
        : 20;

    const now = new Date();
    const soon = new Date(
      now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000,
    );

    // "licença atual" (não superada) — usado dentro dos filtros de relação
    const currentLicense: Prisma.LicenseWhereInput = {
      isActive: true,
      renewal: { is: null },
    };
    const expiredLicense: Prisma.LicenseWhereInput = {
      ...currentLicense,
      status: 'EXPIRED',
    };
    const expiringLicense: Prisma.LicenseWhereInput = {
      ...currentLicense,
      status: 'ACTIVE',
      expirationDate: { gte: now, lte: soon },
    };

    const baseWhere: Prisma.CompanyWhereInput = {
      teamId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { cnpj: { contains: search } },
            ],
          }
        : {}),
    };

    const filterWhere = (
      f?: LicenseCompanyFilter,
    ): Prisma.CompanyWhereInput => {
      switch (f) {
        case 'with':
          return { licenses: { some: currentLicense } };
        case 'without':
          return { licenses: { none: currentLicense } };
        case 'has_expired':
          return { licenses: { some: expiredLicense } };
        case 'has_expiring':
          return { licenses: { some: expiringLicense } };
        default:
          return {};
      }
    };

    const where: Prisma.CompanyWhereInput = {
      AND: [baseWhere, filterWhere(options.filter)],
    };

    const [total, grandTotal, withLicenses, withExpired, withExpiring, rows] =
      await Promise.all([
        this.prisma.company.count({ where }),
        this.prisma.company.count({ where: baseWhere }),
        this.prisma.company.count({
          where: { AND: [baseWhere, filterWhere('with')] },
        }),
        this.prisma.company.count({
          where: { AND: [baseWhere, filterWhere('has_expired')] },
        }),
        this.prisma.company.count({
          where: { AND: [baseWhere, filterWhere('has_expiring')] },
        }),
        this.prisma.company.findMany({
          where,
          select: {
            id: true,
            name: true,
            cnpj: true,
            licenses: {
              where: currentLicense,
              select: { status: true, expirationDate: true },
            },
          },
          orderBy: { name: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

    const items = rows.map((c) => {
      const byStatus: Record<LicenseStatus, number> = {
        PENDING: 0,
        ACTIVE: 0,
        EXPIRED: 0,
        SUSPENDED: 0,
        CANCELLED: 0,
      };
      let expiringSoon = 0;
      for (const l of c.licenses) {
        byStatus[l.status]++;
        if (
          l.status === 'ACTIVE' &&
          l.expirationDate &&
          l.expirationDate >= now &&
          l.expirationDate <= soon
        ) {
          expiringSoon++;
        }
      }

      let health: LicenseCompanyHealth;
      if (c.licenses.length === 0) health = 'none';
      else if (byStatus.EXPIRED > 0) health = 'critical';
      else if (
        expiringSoon > 0 ||
        byStatus.PENDING > 0 ||
        byStatus.SUSPENDED > 0
      )
        health = 'attention';
      else health = 'ok';

      return {
        companyId: c.id,
        companyName: c.name,
        cnpj: c.cnpj,
        licensesCount: c.licenses.length,
        byStatus,
        expiringSoon,
        expired: byStatus.EXPIRED,
        health,
      };
    });

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      counts: {
        total: grandTotal,
        withLicenses,
        withoutLicenses: grandTotal - withLicenses,
        withExpired,
        withExpiring,
      },
    };
  }

  // ─── Staff: licenças atuais de uma empresa ─────────────────────────────────

  async findAllByCompany(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    return this.prisma.license.findMany({
      where: { companyId, isActive: true, renewal: { is: null } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  // ─── Staff: listagem geral do escritório (paginada + contagens) ────────────

  async findAllByTeam(
    teamId: string,
    userId: string,
    options: {
      companyId?: string;
      type?: LicenseType;
      status?: LicenseStatus;
      search?: string;
      expiring?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    await this.ensureMember(teamId, userId);

    const search = options.search?.trim();
    const page =
      Number.isFinite(options.page) && (options.page as number) > 0
        ? Math.trunc(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
        ? Math.min(100, Math.trunc(options.pageSize as number))
        : 20;

    const now = new Date();
    const soonThreshold = new Date(
      now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000,
    );

    // Base: licenças "atuais" (não superadas) da equipe, com filtros que entram nas contagens
    const baseWhere: Prisma.LicenseWhereInput = {
      company: { teamId },
      isActive: true,
      renewal: { is: null },
      ...(options.companyId ? { companyId: options.companyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { number: { contains: search, mode: 'insensitive' } },
              { protocolNumber: { contains: search, mode: 'insensitive' } },
              { issuingBody: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const filters: Prisma.LicenseWhereInput[] = [];
    if (options.type) filters.push({ type: options.type });
    if (options.status) filters.push({ status: options.status });
    if (options.expiring) {
      filters.push({
        status: 'ACTIVE',
        expirationDate: { gte: now, lte: soonThreshold },
      });
    }

    const where: Prisma.LicenseWhereInput = { AND: [baseWhere, ...filters] };

    const companySelect = { select: { id: true, name: true, cnpj: true } };

    const [items, total, expiringSoon, ...statusCounts] = await Promise.all([
      this.prisma.license.findMany({
        where,
        include: { company: companySelect },
        orderBy: [{ expirationDate: 'asc' }, { type: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.license.count({ where }),
      this.prisma.license.count({
        where: {
          AND: [
            baseWhere,
            {
              status: 'ACTIVE',
              expirationDate: { gte: now, lte: soonThreshold },
            },
          ],
        },
      }),
      ...ALL_STATUSES.map((s) =>
        this.prisma.license.count({
          where: { AND: [baseWhere, { status: s }] },
        }),
      ),
    ]);

    const byStatus = Object.fromEntries(
      ALL_STATUSES.map((s, i) => [s, statusCounts[i]]),
    ) as Record<LicenseStatus, number>;

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      counts: {
        total: statusCounts.reduce((a, b) => a + b, 0),
        byStatus,
        expiringSoon,
      },
    };
  }

  // ─── Staff: licenças vencendo em N dias ────────────────────────────────────

  async findExpiringSoon(
    teamId: string,
    userId: string,
    days: number = EXPIRING_SOON_DAYS,
  ) {
    await this.ensureMember(teamId, userId);

    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return this.prisma.license.findMany({
      where: {
        company: { teamId },
        isActive: true,
        renewal: { is: null },
        status: 'ACTIVE',
        expirationDate: { gte: now, lte: future },
      },
      include: { company: { select: { id: true, name: true, cnpj: true } } },
      orderBy: { expirationDate: 'asc' },
    });
  }

  // ─── Staff: resumo de alertas (badge no menu) ──────────────────────────────

  async getSummary(teamId: string, userId: string) {
    await this.ensureMember(teamId, userId);

    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const in7 = new Date(now.getTime() + 7 * day);
    const in15 = new Date(now.getTime() + 15 * day);
    const in30 = new Date(now.getTime() + 30 * day);

    const base: Prisma.LicenseWhereInput = {
      company: { teamId },
      isActive: true,
      renewal: { is: null },
    };

    const [expired, pending, critical, warning, attention, expiringSoon30] =
      await Promise.all([
        this.prisma.license.count({ where: { ...base, status: 'EXPIRED' } }),
        this.prisma.license.count({ where: { ...base, status: 'PENDING' } }),
        this.prisma.license.count({
          where: {
            ...base,
            status: 'ACTIVE',
            expirationDate: { gte: now, lte: in7 },
          },
        }),
        this.prisma.license.count({
          where: {
            ...base,
            status: 'ACTIVE',
            expirationDate: { gt: in7, lte: in15 },
          },
        }),
        this.prisma.license.count({
          where: {
            ...base,
            status: 'ACTIVE',
            expirationDate: { gt: in15, lte: in30 },
          },
        }),
        this.prisma.license.count({
          where: {
            ...base,
            status: 'ACTIVE',
            expirationDate: { gte: now, lte: in30 },
          },
        }),
      ]);

    return {
      expired,
      pending,
      critical, // ACTIVE, vence em 0-7 dias
      warning, // ACTIVE, vence em 8-15 dias
      attention, // ACTIVE, vence em 16-30 dias
      expiringSoon30, // ACTIVE, vence em 0-30 dias
      hasAlerts: expired > 0 || critical > 0,
    };
  }

  // ─── Staff: detalhe de uma licença ─────────────────────────────────────────

  async findOne(
    teamId: string,
    companyId: string,
    licenseId: string,
    userId: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const license = await this.prisma.license.findFirst({
      where: { id: licenseId, companyId, isActive: true },
      include: {
        renewal: {
          select: { id: true, issueDate: true, expirationDate: true },
        },
        renewedFrom: {
          select: { id: true, issueDate: true, expirationDate: true },
        },
      },
    });

    if (!license) throw new NotFoundException('Licença não encontrada');

    return { ...license, isSuperseded: license.renewal != null };
  }

  // ─── Staff: histórico (cadeia de renovações) ───────────────────────────────

  async getHistory(
    teamId: string,
    companyId: string,
    licenseId: string,
    userId: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const start = await this.prisma.license.findFirst({
      where: { id: licenseId, companyId, isActive: true },
    });
    if (!start) throw new NotFoundException('Licença não encontrada');

    // Anda até a raiz da cadeia
    let root = start;
    let parentId = root.renewedFromId;
    while (parentId) {
      const prev = await this.prisma.license.findUnique({
        where: { id: parentId },
      });
      if (!prev) break;
      root = prev;
      parentId = prev.renewedFromId;
    }

    // Anda para frente coletando a cadeia em ordem cronológica
    const chain = [root];
    let current = root;
    for (;;) {
      const next = await this.prisma.license.findUnique({
        where: { renewedFromId: current.id },
      });
      if (!next) break;
      chain.push(next);
      current = next;
    }

    return chain;
  }

  // ─── Staff: atualizar licença ──────────────────────────────────────────────

  async update(
    teamId: string,
    companyId: string,
    licenseId: string,
    userId: string,
    dto: UpdateLicenseDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const license = await this.prisma.license.findFirst({
      where: { id: licenseId, companyId, isActive: true },
    });
    if (!license) throw new NotFoundException('Licença não encontrada');

    const status = this.resolveStatusOnUpdate(dto);

    return this.prisma.license.update({
      where: { id: licenseId },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(status && { status }),
        ...(dto.issuingBody !== undefined && { issuingBody: dto.issuingBody }),
        ...(dto.number !== undefined && { number: dto.number }),
        ...(dto.protocolNumber !== undefined && {
          protocolNumber: dto.protocolNumber,
        }),
        ...(dto.issueDate !== undefined && {
          issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        }),
        ...(dto.expirationDate !== undefined && {
          expirationDate: dto.expirationDate
            ? new Date(dto.expirationDate)
            : null,
        }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.fileUrl !== undefined && { fileUrl: dto.fileUrl }),
        ...(dto.fileName !== undefined && { fileName: dto.fileName }),
        ...(dto.mimeType !== undefined && { mimeType: dto.mimeType }),
      },
    });
  }

  // ─── Staff: renovar licença (cria novo registro vinculado) ─────────────────

  async renew(
    teamId: string,
    companyId: string,
    licenseId: string,
    userId: string,
    dto: RenewLicenseDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const license = await this.prisma.license.findFirst({
      where: { id: licenseId, companyId, isActive: true },
      include: { renewal: { select: { id: true } } },
    });
    if (!license) throw new NotFoundException('Licença não encontrada');
    if (license.renewal) {
      throw new BadRequestException(
        'Essa licença já foi renovada — renove a versão mais recente',
      );
    }

    return this.prisma.license.create({
      data: {
        companyId,
        type: license.type,
        name: license.name,
        issuingBody: dto.issuingBody ?? license.issuingBody,
        number: dto.number,
        protocolNumber: dto.protocolNumber,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : null,
        notes: dto.notes,
        renewedFromId: licenseId,
        ...(this.resolveStatusOnCreate(dto)
          ? { status: this.resolveStatusOnCreate(dto)! }
          : {}),
      },
    });
  }

  // ─── Staff: gravar arquivo após upload ─────────────────────────────────────

  async updateFile(
    teamId: string,
    companyId: string,
    licenseId: string,
    userId: string,
    fileUrl: string,
    fileName: string,
    mimeType?: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const license = await this.prisma.license.findFirst({
      where: { id: licenseId, companyId, isActive: true },
    });
    if (!license) throw new NotFoundException('Licença não encontrada');

    if (license.fileUrl && license.fileUrl !== fileUrl) {
      await this.storage.delete(license.fileUrl).catch(() => null);
    }

    return this.prisma.license.update({
      where: { id: licenseId },
      data: { fileUrl, fileName, mimeType: mimeType ?? null },
    });
  }

  // ─── Staff: remover licença (soft delete) ──────────────────────────────────

  async remove(
    teamId: string,
    companyId: string,
    licenseId: string,
    userId: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const license = await this.prisma.license.findFirst({
      where: { id: licenseId, companyId, isActive: true },
    });
    if (!license) throw new NotFoundException('Licença não encontrada');

    return this.prisma.license.update({
      where: { id: licenseId },
      data: { isActive: false },
    });
  }

  // ─── Portal cliente: listar licenças atuais ────────────────────────────────

  async findAllForClient(companyId: string, companyUserId: string) {
    await this.ensureCompanyUser(companyId, companyUserId);

    return this.prisma.license.findMany({
      where: { companyId, isActive: true, renewal: { is: null } },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      select: CLIENT_LICENSE_SELECT,
    });
  }

  // ─── Portal cliente: download do arquivo ───────────────────────────────────

  async getDownloadUrl(
    companyId: string,
    licenseId: string,
    companyUserId: string,
  ) {
    await this.ensureCompanyUser(companyId, companyUserId);

    const license = await this.prisma.license.findFirst({
      where: { id: licenseId, companyId, isActive: true },
      select: { fileUrl: true, fileName: true },
    });
    if (!license) throw new NotFoundException('Licença não encontrada');
    if (!license.fileUrl)
      throw new NotFoundException('Arquivo da licença não disponível');

    return { fileUrl: license.fileUrl, fileName: license.fileName };
  }

  // ─── Internos ──────────────────────────────────────────────────────────────

  private resolveName(type: LicenseType, name?: string): string {
    const trimmed = name?.trim();
    if (trimmed) return trimmed;
    if (type === LicenseType.OUTRO) {
      throw new BadRequestException(
        'Informe o nome da licença quando o tipo for OUTRO',
      );
    }
    return LICENSE_TYPE_LABELS[type];
  }

  private resolveStatusOnCreate(dto: {
    status?: LicenseStatus;
    issueDate?: string;
    expirationDate?: string;
  }): LicenseStatus | undefined {
    if (dto.status) return dto.status;
    if (dto.expirationDate) {
      return new Date(dto.expirationDate) < new Date()
        ? LicenseStatus.EXPIRED
        : LicenseStatus.ACTIVE;
    }
    if (dto.issueDate) return LicenseStatus.ACTIVE;
    return undefined; // deixa o default do schema (PENDING)
  }

  private resolveStatusOnUpdate(dto: {
    status?: LicenseStatus;
    expirationDate?: string;
  }): LicenseStatus | undefined {
    if (dto.status) return dto.status;
    if (dto.expirationDate) {
      return new Date(dto.expirationDate) < new Date()
        ? LicenseStatus.EXPIRED
        : LicenseStatus.ACTIVE;
    }
    return undefined; // não mexe no status
  }

  // ─── Helpers de autorização (mesmo padrão do CndService) ───────────────────

  private async ensureAccess(
    teamId: string,
    companyId: string,
    userId: string,
  ) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
  }

  private async ensureMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
  }

  private async ensureCompanyUser(companyId: string, companyUserId: string) {
    const companyUser = await this.prisma.companyUser.findFirst({
      where: { id: companyUserId, companyId, isActive: true },
    });
    if (companyUser) return;

    const link = await this.prisma.companyUserCompany.findUnique({
      where: { companyUserId_companyId: { companyUserId, companyId } },
      include: {
        companyUser: { select: { isActive: true } },
        company: { select: { isActive: true } },
      },
    });

    if (!link || !link.companyUser.isActive || !link.company.isActive) {
      throw new ForbiddenException('Acesso negado');
    }
  }
}
