import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../database/index.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, userId: string, dto: CreateCompanyDto) {
    await this.ensureTeamMember(teamId, userId);
    await this.enforceCompanyLimit(teamId);

    if (dto.cnpj) {
      const existing = await this.prisma.company.findUnique({
        where: { cnpj: dto.cnpj },
      });
      if (existing) throw new ConflictException('CNPJ já cadastrado');
    }

    return this.prisma.company.create({
      data: { ...dto, teamId },
    });
  }

  async findAll(
    teamId: string,
    userId: string,
    options: { search?: string; page?: number; pageSize?: number } = {},
  ) {
    await this.ensureTeamMember(teamId, userId);

    const search = options.search?.trim();
    const page =
      Number.isFinite(options.page) && (options.page as number) > 0
        ? Math.trunc(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
        ? Math.min(100, Math.trunc(options.pageSize as number))
        : 20;

    const where: Prisma.CompanyWhereInput = {
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

    const [total, items] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        include: {
          _count: {
            select: { tasks: true, driveShares: true, serviceRequests: true },
          },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async findOne(teamId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
      include: {
        _count: {
          select: { tasks: true, driveShares: true, serviceRequests: true },
        },
        companyUsers: {
          where: { isActive: true },
          select: { id: true, name: true, email: true, createdAt: true },
        },
      },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    return company;
  }

  async update(
    teamId: string,
    companyId: string,
    userId: string,
    dto: UpdateCompanyDto,
  ) {
    await this.ensureTeamMember(teamId, userId);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    if (dto.cnpj && dto.cnpj !== company.cnpj) {
      const cnpjTaken = await this.prisma.company.findUnique({
        where: { cnpj: dto.cnpj },
      });
      if (cnpjTaken) throw new ConflictException('CNPJ já cadastrado');
    }

    return this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
  }

  async remove(teamId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    return this.prisma.company.update({
      where: { id: companyId },
      data: { isActive: false },
    });
  }

  async importCsv(teamId: string, userId: string, fileBuffer: Buffer) {
    await this.ensureTeamMember(teamId, userId);
    await this.enforceCapability(
      teamId,
      'csv_import',
      'A importação por planilha CSV',
    );

    let rows: Record<string, string>[];

    try {
      rows = parse(fileBuffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch {
      throw new BadRequestException('Arquivo CSV inválido');
    }

    if (rows.length === 0) throw new BadRequestException('Planilha vazia');

    // Limite de empresas do plano: importa até atingir o teto, o resto é pulado.
    const plan = await this.loadActivePlan(teamId);
    const maxCompanies = plan?.maxCompanies ?? null;
    let activeCount =
      maxCompanies == null
        ? 0
        : await this.prisma.company.count({
            where: { teamId, isActive: true },
          });

    const imported: string[] = [];
    const skipped: { row: number; name: string; reason: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = row['nome'] || row['name'];
      const cnpj = row['cnpj']?.replace(/\D/g, '') || undefined;
      const email = row['email'] || undefined;
      const phone = row['telefone'] || row['phone'] || undefined;
      const address = row['endereco'] || row['address'] || undefined;

      if (!name) {
        skipped.push({ row: i + 2, name: '-', reason: 'Nome obrigatório' });
        continue;
      }

      if (cnpj && !/^\d{14}$/.test(cnpj)) {
        skipped.push({ row: i + 2, name, reason: 'CNPJ inválido' });
        continue;
      }

      if (cnpj) {
        const existing = await this.prisma.company.findUnique({
          where: { cnpj },
        });
        if (existing) {
          skipped.push({ row: i + 2, name, reason: 'CNPJ já cadastrado' });
          continue;
        }
      }

      if (maxCompanies != null && activeCount >= maxCompanies) {
        skipped.push({
          row: i + 2,
          name,
          reason: `Limite do plano (${maxCompanies} empresas) atingido`,
        });
        continue;
      }

      await this.prisma.company.create({
        data: { teamId, name, cnpj, email, phone, address },
      });

      activeCount++;
      imported.push(name);
    }

    return { imported: imported.length, skipped };
  }

  // ─── Gerenciamento de acessos de usuários do portal ───────────────────────

  /**
   * Lista usuários do portal com acesso a uma empresa
   */
  async listCompanyUsers(teamId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    return this.prisma.companyUserCompany.findMany({
      where: { companyId },
      include: {
        companyUser: {
          select: {
            id: true,
            name: true,
            email: true,
            companyId: true, // empresa padrão
            isActive: true,
            createdAt: true,
          },
        },
      },
    });
  }

  /**
   * Adiciona acesso de um usuário do portal a uma empresa adicional
   */
  async addUserToCompany(
    teamId: string,
    companyId: string,
    userId: string,
    companyUserId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    // Verifica se o companyUser existe
    const companyUser = await this.prisma.companyUser.findUnique({
      where: { id: companyUserId },
      include: { company: { select: { teamId: true } } },
    });

    if (!companyUser) {
      throw new NotFoundException('Usuário do portal não encontrado');
    }

    // Verifica se o usuário pertence ao mesmo team
    if (companyUser.company.teamId !== teamId) {
      throw new ForbiddenException('Usuário não pertence a este escritório');
    }

    // Verifica se já tem acesso
    const existing = await this.prisma.companyUserCompany.findUnique({
      where: {
        companyUserId_companyId: { companyUserId, companyId },
      },
    });

    if (existing) {
      throw new ConflictException('Usuário já tem acesso a esta empresa');
    }

    return this.prisma.companyUserCompany.create({
      data: {
        companyUserId,
        companyId,
        isDefault: false,
      },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        companyUser: { select: { id: true, name: true, email: true } },
      },
    });
  }

  /**
   * Remove acesso de um usuário do portal a uma empresa
   */
  async removeUserFromCompany(
    teamId: string,
    companyId: string,
    userId: string,
    companyUserId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const link = await this.prisma.companyUserCompany.findUnique({
      where: {
        companyUserId_companyId: { companyUserId, companyId },
      },
    });

    if (!link) {
      throw new NotFoundException('Usuário não tem acesso a esta empresa');
    }

    // Não pode remover se for a empresa padrão
    if (link.isDefault) {
      throw new BadRequestException(
        'Não é possível remover acesso à empresa padrão do usuário',
      );
    }

    return this.prisma.companyUserCompany.delete({
      where: {
        companyUserId_companyId: { companyUserId, companyId },
      },
    });
  }

  /**
   * Lista todos os usuários do portal do team (para adicionar a outras empresas)
   */
  async listAllPortalUsers(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.companyUser.findMany({
      where: {
        company: { teamId },
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        companyId: true,
        company: { select: { id: true, name: true } },
        companies: {
          select: {
            companyId: true,
            isDefault: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Uso atual de empresas vs. limite do plano (para a UI exibir progresso).
   * `max: null` = ilimitado.
   */
  async getUsage(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const plan = await this.loadActivePlan(teamId);
    const used = await this.prisma.company.count({
      where: { teamId, isActive: true },
    });

    return {
      companies: {
        used,
        max: plan?.maxCompanies ?? null,
      },
    };
  }

  // ─── Enforcement de plano ─────────────────────────────────────────────────

  /**
   * Carrega os metadados do plano vigente a partir da Subscription
   * (fonte-de-verdade — o plano vive exclusivamente na Subscription).
   */
  private async loadActivePlan(teamId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      select: {
        planRef: {
          select: { name: true, maxCompanies: true, capabilities: true },
        },
      },
    });

    return sub?.planRef ?? null;
  }

  /**
   * Bloqueia a criação de empresa quando o team atinge o teto do plano.
   * Sem plano ou `maxCompanies` nulo → ilimitado.
   */
  private async enforceCompanyLimit(teamId: string) {
    const plan = await this.loadActivePlan(teamId);
    if (!plan || plan.maxCompanies == null) return;

    const count = await this.prisma.company.count({
      where: { teamId, isActive: true },
    });

    if (count >= plan.maxCompanies) {
      throw new ForbiddenException({
        code: 'PLAN_LIMIT_COMPANIES',
        message: `Seu plano ${plan.name} permite até ${plan.maxCompanies} empresas. Faça upgrade para cadastrar mais.`,
      });
    }
  }

  /**
   * Exige que o plano do team possua a capability informada.
   */
  private async enforceCapability(
    teamId: string,
    capability: string,
    label: string,
  ) {
    const plan = await this.loadActivePlan(teamId);
    const capabilities = plan?.capabilities ?? [];

    if (!capabilities.includes(capability)) {
      throw new ForbiddenException({
        code: 'PLAN_CAPABILITY_REQUIRED',
        message: `${label} está disponível apenas em planos superiores. Faça upgrade para utilizar.`,
      });
    }
  }

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');

    return member;
  }

  private async ensureCompanyBelongsToTeam(teamId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    return company;
  }
}
