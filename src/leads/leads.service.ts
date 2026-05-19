import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import {
  LeadActivityType,
  LeadSource,
  LeadStatus,
} from 'generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client.js';
import { CreateLeadLpDto } from './dto/create-lead-lp.dto.js';
import { CreateLeadManualDto } from './dto/create-lead-manual.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';
import { ListLeadsDto } from './dto/list-leads.dto.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { ConvertLeadDto } from './dto/convert-lead.dto.js';

const LEAD_DETAIL_INCLUDE = {
  partner: { select: { id: true, name: true, slug: true } },
  landingPage: { select: { id: true, title: true, url: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  convertedTeam: { select: { id: true, name: true } },
} as const;

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── CAPTURA PÚBLICA: form da LP ──────────────────────────────────────────

  async createFromLandingPage(dto: CreateLeadLpDto) {
    // Resolve parceiro a partir do slug (cookie tabilize_ref)
    let partnerId: string | null = null;
    if (dto.partnerSlug) {
      const partner = await this.prisma.partner.findUnique({
        where: { slug: dto.partnerSlug },
        select: { id: true, status: true, isActive: true },
      });
      if (partner && partner.isActive && partner.status === 'APPROVED') {
        partnerId = partner.id;
      }
    }

    // Valida LandingPage se fornecida
    let landingPageId: string | null = null;
    if (dto.landingPageId) {
      const lp = await this.prisma.landingPage.findUnique({
        where: { id: dto.landingPageId },
        select: { id: true, isActive: true },
      });
      if (lp && lp.isActive) {
        landingPageId = lp.id;
      }
    }

    // Define source: PARTNER_LINK se tem partner mas não tem LP, senão LANDING_PAGE
    const source: LeadSource =
      landingPageId !== null
        ? LeadSource.LANDING_PAGE
        : partnerId !== null
          ? LeadSource.PARTNER_LINK
          : LeadSource.ORGANIC;

    return this.prisma.lead.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        companyName: dto.companyName,
        cnpj: dto.cnpj,
        source,
        partnerId,
        landingPageId,
        utmSource: dto.utmSource,
        utmMedium: dto.utmMedium,
        utmCampaign: dto.utmCampaign,
        utmTerm: dto.utmTerm,
        utmContent: dto.utmContent,
        referrerUrl: dto.referrerUrl,
      },
      include: LEAD_DETAIL_INCLUDE,
    });
  }

  // ── ADMIN: cadastro manual ───────────────────────────────────────────────

  async createManual(dto: CreateLeadManualDto) {
    if (dto.partnerId) {
      const exists = await this.prisma.partner.count({
        where: { id: dto.partnerId },
      });
      if (!exists) throw new BadRequestException('Parceiro inválido');
    }
    if (dto.landingPageId) {
      const exists = await this.prisma.landingPage.count({
        where: { id: dto.landingPageId },
      });
      if (!exists) throw new BadRequestException('Landing page inválida');
    }
    if (dto.assignedToId) {
      const exists = await this.prisma.user.count({
        where: { id: dto.assignedToId, isActive: true },
      });
      if (!exists)
        throw new BadRequestException('Usuário responsável inválido');
    }

    return this.prisma.lead.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        companyName: dto.companyName,
        cnpj: dto.cnpj,
        source: dto.source,
        partnerId: dto.partnerId,
        landingPageId: dto.landingPageId,
        assignedToId: dto.assignedToId,
        notes: dto.notes,
      },
      include: LEAD_DETAIL_INCLUDE,
    });
  }

  // ── ADMIN: listagem ──────────────────────────────────────────────────────

  async list(options: ListLeadsDto = {}) {
    const search = options.search?.trim();
    const page =
      Number.isFinite(options.page) && (options.page as number) > 0
        ? Math.trunc(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
        ? Math.min(100, Math.trunc(options.pageSize as number))
        : 20;

    const where: Prisma.LeadWhereInput = {
      ...(options.status ? { status: options.status } : {}),
      ...(options.source ? { source: options.source } : {}),
      ...(options.partnerId ? { partnerId: options.partnerId } : {}),
      ...(options.assignedToId ? { assignedToId: options.assignedToId } : {}),
      ...(options.landingPageId
        ? { landingPageId: options.landingPageId }
        : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { companyName: { contains: search, mode: 'insensitive' } },
              { cnpj: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total, byStatus] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        include: LEAD_DETAIL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    const counts: Record<LeadStatus, number> = {
      NEW: 0,
      CONTACTED: 0,
      QUALIFIED: 0,
      PROPOSAL: 0,
      NEGOTIATING: 0,
      CONVERTED: 0,
      LOST: 0,
      DISQUALIFIED: 0,
    };
    for (const row of byStatus) {
      counts[row.status] = (row._count as { _all: number })._all;
    }

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      counts,
    };
  }

  async find(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        ...LEAD_DETAIL_INCLUDE,
        activities: {
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead não encontrada');
    return lead;
  }

  // ── ADMIN: update (gera STATUS_CHANGE automaticamente) ───────────────────

  async update(leadId: string, dto: UpdateLeadDto, actorUserId: string) {
    const current = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException('Lead não encontrada');

    if (dto.assignedToId) {
      const exists = await this.prisma.user.count({
        where: { id: dto.assignedToId, isActive: true },
      });
      if (!exists)
        throw new BadRequestException('Usuário responsável inválido');
    }

    const statusChanged =
      dto.status !== undefined && dto.status !== current.status;

    const updated = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id: leadId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.email !== undefined ? { email: dto.email } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.companyName !== undefined
            ? { companyName: dto.companyName }
            : {}),
          ...(dto.cnpj !== undefined ? { cnpj: dto.cnpj } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.assignedToId !== undefined
            ? { assignedToId: dto.assignedToId }
            : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        },
        include: LEAD_DETAIL_INCLUDE,
      });

      if (statusChanged) {
        await tx.leadActivity.create({
          data: {
            leadId,
            type: LeadActivityType.STATUS_CHANGE,
            metadata: {
              fromStatus: current.status,
              toStatus: dto.status,
            },
            createdById: actorUserId,
          },
        });
      }

      return lead;
    });

    return updated;
  }

  async remove(leadId: string) {
    try {
      await this.prisma.lead.delete({ where: { id: leadId } });
      return { message: 'Lead removida' };
    } catch {
      throw new NotFoundException('Lead não encontrada');
    }
  }

  // ── ADMIN: activities ────────────────────────────────────────────────────

  async listActivities(leadId: string) {
    const exists = await this.prisma.lead.count({ where: { id: leadId } });
    if (!exists) throw new NotFoundException('Lead não encontrada');

    return this.prisma.leadActivity.findMany({
      where: { leadId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createActivity(
    leadId: string,
    dto: CreateActivityDto,
    actorUserId: string,
  ) {
    const exists = await this.prisma.lead.count({ where: { id: leadId } });
    if (!exists) throw new NotFoundException('Lead não encontrada');

    return this.prisma.leadActivity.create({
      data: {
        leadId,
        type: dto.type,
        content: dto.content,
        createdById: actorUserId,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async deleteActivity(leadId: string, activityId: string) {
    const activity = await this.prisma.leadActivity.findFirst({
      where: { id: activityId, leadId },
    });
    if (!activity) throw new NotFoundException('Atividade não encontrada');

    if (activity.type === LeadActivityType.STATUS_CHANGE) {
      throw new BadRequestException(
        'Atividades de mudança de status não podem ser removidas',
      );
    }

    await this.prisma.leadActivity.delete({ where: { id: activityId } });
    return { message: 'Atividade removida' };
  }

  // ── ADMIN: conversão manual ──────────────────────────────────────────────

  async convertManual(
    leadId: string,
    dto: ConvertLeadDto,
    actorUserId: string,
  ) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: { id: true, status: true, convertedToTeamId: true },
    });
    if (!lead) throw new NotFoundException('Lead não encontrada');
    if (lead.status === LeadStatus.CONVERTED) {
      throw new ConflictException('Lead já está convertida');
    }

    const team = await this.prisma.team.findUnique({
      where: { id: dto.teamId },
      select: { id: true, convertedFromLead: { select: { id: true } } },
    });
    if (!team) throw new NotFoundException('Team não encontrado');
    if (team.convertedFromLead) {
      throw new ConflictException(
        'Este Team já está vinculado a outra Lead convertida',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: LeadStatus.CONVERTED,
          convertedAt: new Date(),
          convertedToTeamId: dto.teamId,
        },
        include: LEAD_DETAIL_INCLUDE,
      });

      await tx.leadActivity.create({
        data: {
          leadId,
          type: LeadActivityType.STATUS_CHANGE,
          metadata: {
            fromStatus: lead.status,
            toStatus: LeadStatus.CONVERTED,
            convertedToTeamId: dto.teamId,
          },
          createdById: actorUserId,
        },
      });

      return updated;
    });
  }

  // ── INTERNO: auto-conversion no signup do staff ─────────────────────────

  /**
   * Procura Lead pendente (não convertida) com email correspondente e marca
   * como CONVERTED, linkando o Team recém-criado.
   *
   * Chamada pelo AuthService.register após criar o Team. Falha silenciosa
   * se não encontrar — não bloqueia o signup.
   */
  async autoConvertOnSignup(params: {
    email: string;
    teamId: string;
    partnerId: string | null;
  }) {
    try {
      // Prioriza lead com mesmo email + partnerId; fallback só email.
      const lead = await this.prisma.lead.findFirst({
        where: {
          email: { equals: params.email, mode: 'insensitive' },
          status: { not: LeadStatus.CONVERTED },
          convertedToTeamId: null,
          ...(params.partnerId
            ? {
                OR: [{ partnerId: params.partnerId }, { partnerId: null }],
              }
            : {}),
        },
        orderBy: [{ partnerId: 'desc' }, { createdAt: 'desc' }],
        select: { id: true, status: true },
      });

      if (!lead) return;

      await this.prisma.$transaction(async (tx) => {
        await tx.lead.update({
          where: { id: lead.id },
          data: {
            status: LeadStatus.CONVERTED,
            convertedAt: new Date(),
            convertedToTeamId: params.teamId,
          },
        });

        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            type: LeadActivityType.STATUS_CHANGE,
            metadata: {
              fromStatus: lead.status,
              toStatus: LeadStatus.CONVERTED,
              convertedToTeamId: params.teamId,
              automatic: true,
            },
          },
        });
      });
    } catch {
      // não bloqueia signup se algo falhar aqui
    }
  }

  // ── PARCEIRO: contagem pro dashboard ─────────────────────────────────────

  async countForPartner(partnerId: string) {
    const [total, byStatus] = await this.prisma.$transaction([
      this.prisma.lead.count({ where: { partnerId } }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { partnerId },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);

    const counts: Record<LeadStatus, number> = {
      NEW: 0,
      CONTACTED: 0,
      QUALIFIED: 0,
      PROPOSAL: 0,
      NEGOTIATING: 0,
      CONVERTED: 0,
      LOST: 0,
      DISQUALIFIED: 0,
    };
    for (const row of byStatus) {
      counts[row.status] = (row._count as { _all: number })._all;
    }

    return { total, byStatus: counts };
  }
}
