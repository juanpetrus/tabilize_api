import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateCndDto } from './dto/create-cnd.dto.js';
import { UpdateCndDto } from './dto/update-cnd.dto.js';
import { CndStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class CndService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Staff: Criar/Atualizar CND manualmente ────────────────────────────────

  async upsert(
    teamId: string,
    companyId: string,
    userId: string,
    dto: CreateCndDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    return this.prisma.cnd.upsert({
      where: {
        companyId_type: { companyId, type: dto.type },
      },
      create: {
        companyId,
        type: dto.type,
        status: CndStatus.PENDING,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : null,
        protocolNumber: dto.protocolNumber,
        autoSync: dto.autoSync ?? true,
      },
      update: {
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expirationDate: dto.expirationDate
          ? new Date(dto.expirationDate)
          : undefined,
        protocolNumber: dto.protocolNumber,
        autoSync: dto.autoSync,
      },
    });
  }

  // ─── Staff: Listar CNDs de uma empresa ─────────────────────────────────────

  async findAllByCompany(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    return this.prisma.cnd.findMany({
      where: { companyId, isActive: true },
      orderBy: { type: 'asc' },
    });
  }

  // ─── Staff: Listar CNDs de todo o escritório ───────────────────────────────

  async findAllByTeam(teamId: string, userId: string) {
    await this.ensureMember(teamId, userId);

    return this.prisma.cnd.findMany({
      where: { company: { teamId }, isActive: true },
      include: { company: { select: { id: true, name: true, cnpj: true } } },
      orderBy: [{ expirationDate: 'asc' }, { type: 'asc' }],
    });
  }

  // ─── Staff: CNDs próximas do vencimento ────────────────────────────────────

  async findExpiringSoon(teamId: string, userId: string, days: number = 30) {
    await this.ensureMember(teamId, userId);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.prisma.cnd.findMany({
      where: {
        company: { teamId },
        isActive: true,
        expirationDate: {
          lte: futureDate,
          gte: new Date(),
        },
        status: { in: [CndStatus.VALID, CndStatus.POSITIVE_NEGATIVE] },
      },
      include: { company: { select: { id: true, name: true, cnpj: true } } },
      orderBy: { expirationDate: 'asc' },
    });
  }

  // ─── Staff: Resumo de alertas de vencimento ──────────────────────────────────

  async getAlertsSummary(teamId: string, userId: string) {
    await this.ensureMember(teamId, userId);

    const now = new Date();
    const in3Days = new Date();
    in3Days.setDate(now.getDate() + 3);
    const in7Days = new Date();
    in7Days.setDate(now.getDate() + 7);
    const in15Days = new Date();
    in15Days.setDate(now.getDate() + 15);
    const in30Days = new Date();
    in30Days.setDate(now.getDate() + 30);

    const [expired, critical, warning, attention, total] = await Promise.all([
      // Vencidas
      this.prisma.cnd.count({
        where: {
          company: { teamId },
          isActive: true,
          status: CndStatus.EXPIRED,
        },
      }),
      // Críticas (0-3 dias)
      this.prisma.cnd.count({
        where: {
          company: { teamId },
          isActive: true,
          expirationDate: { lte: in3Days, gte: now },
          status: { in: [CndStatus.VALID, CndStatus.POSITIVE_NEGATIVE] },
        },
      }),
      // Atenção (4-7 dias)
      this.prisma.cnd.count({
        where: {
          company: { teamId },
          isActive: true,
          expirationDate: { lte: in7Days, gt: in3Days },
          status: { in: [CndStatus.VALID, CndStatus.POSITIVE_NEGATIVE] },
        },
      }),
      // Alerta (8-15 dias)
      this.prisma.cnd.count({
        where: {
          company: { teamId },
          isActive: true,
          expirationDate: { lte: in15Days, gt: in7Days },
          status: { in: [CndStatus.VALID, CndStatus.POSITIVE_NEGATIVE] },
        },
      }),
      // Total próximas 30 dias
      this.prisma.cnd.count({
        where: {
          company: { teamId },
          isActive: true,
          expirationDate: { lte: in30Days, gte: now },
          status: { in: [CndStatus.VALID, CndStatus.POSITIVE_NEGATIVE] },
        },
      }),
    ]);

    return {
      expired,
      critical, // 0-3 dias
      warning, // 4-7 dias
      attention, // 8-15 dias
      total, // 0-30 dias
      hasAlerts: expired > 0 || critical > 0 || warning > 0,
    };
  }

  // ─── Staff: Buscar uma CND específica ──────────────────────────────────────

  async findOne(
    teamId: string,
    companyId: string,
    cndId: string,
    userId: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const cnd = await this.prisma.cnd.findFirst({
      where: { id: cndId, companyId, isActive: true },
    });

    if (!cnd) throw new NotFoundException('Certidão não encontrada');
    return cnd;
  }

  // ─── Staff: Atualizar CND ──────────────────────────────────────────────────

  async update(
    teamId: string,
    companyId: string,
    cndId: string,
    userId: string,
    dto: UpdateCndDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const cnd = await this.prisma.cnd.findFirst({
      where: { id: cndId, companyId, isActive: true },
    });

    if (!cnd) throw new NotFoundException('Certidão não encontrada');

    // Calcular status baseado na data de validade
    let status = dto.status;
    if (dto.expirationDate && !dto.status) {
      const expDate = new Date(dto.expirationDate);
      if (expDate < new Date()) {
        status = CndStatus.EXPIRED;
      }
    }

    return this.prisma.cnd.update({
      where: { id: cndId },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(status && { status }),
        ...(dto.issueDate && { issueDate: new Date(dto.issueDate) }),
        ...(dto.expirationDate && {
          expirationDate: new Date(dto.expirationDate),
        }),
        ...(dto.protocolNumber !== undefined && {
          protocolNumber: dto.protocolNumber,
        }),
        ...(dto.fileUrl !== undefined && { fileUrl: dto.fileUrl }),
        ...(dto.fileName !== undefined && { fileName: dto.fileName }),
        ...(dto.autoSync !== undefined && { autoSync: dto.autoSync }),
        ...(dto.lastError !== undefined && { lastError: dto.lastError }),
      },
    });
  }

  // ─── Staff: Atualizar arquivo (upload de PDF) ──────────────────────────────

  async updateFile(
    teamId: string,
    companyId: string,
    cndId: string,
    userId: string,
    fileUrl: string,
    fileName: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const cnd = await this.prisma.cnd.findFirst({
      where: { id: cndId, companyId, isActive: true },
    });

    if (!cnd) throw new NotFoundException('Certidão não encontrada');

    return this.prisma.cnd.update({
      where: { id: cndId },
      data: { fileUrl, fileName },
    });
  }

  // ─── Staff: Remover CND ────────────────────────────────────────────────────

  async remove(
    teamId: string,
    companyId: string,
    cndId: string,
    userId: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const cnd = await this.prisma.cnd.findFirst({
      where: { id: cndId, companyId, isActive: true },
    });

    if (!cnd) throw new NotFoundException('Certidão não encontrada');

    return this.prisma.cnd.update({
      where: { id: cndId },
      data: { isActive: false },
    });
  }

  // ─── Portal Cliente: Listar CNDs ───────────────────────────────────────────

  async findAllForClient(companyId: string, companyUserId: string) {
    await this.ensureCompanyUser(companyId, companyUserId);

    return this.prisma.cnd.findMany({
      where: { companyId, isActive: true },
      orderBy: { type: 'asc' },
      select: {
        id: true,
        type: true,
        status: true,
        issueDate: true,
        expirationDate: true,
        protocolNumber: true,
        fileUrl: true,
        fileName: true,
        updatedAt: true,
      },
    });
  }

  // ─── Portal Cliente: Download de CND ───────────────────────────────────────

  async getDownloadUrl(
    companyId: string,
    cndId: string,
    companyUserId: string,
  ) {
    await this.ensureCompanyUser(companyId, companyUserId);

    const cnd = await this.prisma.cnd.findFirst({
      where: { id: cndId, companyId, isActive: true },
      select: { fileUrl: true, fileName: true },
    });

    if (!cnd) throw new NotFoundException('Certidão não encontrada');
    if (!cnd.fileUrl)
      throw new NotFoundException('Arquivo da certidão não disponível');

    return { fileUrl: cnd.fileUrl, fileName: cnd.fileName };
  }

  // ─── Helpers de autorização ────────────────────────────────────────────────

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
    // Verifica se é a empresa padrão do usuário
    const companyUser = await this.prisma.companyUser.findFirst({
      where: { id: companyUserId, companyId, isActive: true },
    });

    if (companyUser) return;

    // Verifica se o usuário está vinculado à empresa
    const link = await this.prisma.companyUserCompany.findUnique({
      where: {
        companyUserId_companyId: { companyUserId, companyId },
      },
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
