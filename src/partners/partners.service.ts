import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { MailService } from '../mail/mail.service.js';
import { LeadsService } from '../leads/leads.service.js';
import { PartnerStatus } from 'generated/prisma/enums';
import { Prisma } from '../../generated/prisma/client.js';
import { ListPartnersDto } from './dto/list-partners.dto.js';
import { UpdatePartnerDto } from './dto/update-partner.dto.js';
import { RejectPartnerDto } from './dto/reject-partner.dto.js';
import { UpsertMaterialDto } from './dto/upsert-material.dto.js';

const PARTNER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  document: true,
  slug: true,
  commissionPct: true,
  status: true,
  approvedAt: true,
  approvedById: true,
  rejectedReason: true,
  clicks: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly leads: LeadsService,
  ) {}

  // ── ADMIN: listar/buscar parceiros ──────────────────────────────────────

  async listAdmin(options: ListPartnersDto = {}) {
    const search = options.search?.trim();
    const page =
      Number.isFinite(options.page) && (options.page as number) > 0
        ? Math.trunc(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
        ? Math.min(100, Math.trunc(options.pageSize as number))
        : 20;

    const where: Prisma.PartnerWhereInput = {
      ...(options.status ? { status: options.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total, pending, approved, rejected, suspended] =
      await this.prisma.$transaction([
        this.prisma.partner.findMany({
          where,
          select: PARTNER_SAFE_SELECT,
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        this.prisma.partner.count({ where }),
        this.prisma.partner.count({ where: { status: PartnerStatus.PENDING } }),
        this.prisma.partner.count({
          where: { status: PartnerStatus.APPROVED },
        }),
        this.prisma.partner.count({
          where: { status: PartnerStatus.REJECTED },
        }),
        this.prisma.partner.count({
          where: { status: PartnerStatus.SUSPENDED },
        }),
      ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
      counts: { pending, approved, rejected, suspended },
    };
  }

  async findAdmin(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        ...PARTNER_SAFE_SELECT,
        approvedBy: { select: { id: true, name: true, email: true } },
      },
    });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');

    const referredCount = await this.prisma.team.count({
      where: { referredByPartnerId: partnerId },
    });

    return { ...partner, referredCount };
  }

  async approve(partnerId: string, approverId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
    });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');
    if (partner.status === PartnerStatus.APPROVED) {
      throw new BadRequestException('Parceiro já está aprovado');
    }

    const updated = await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        status: PartnerStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: approverId,
        rejectedReason: null,
      },
      select: PARTNER_SAFE_SELECT,
    });

    const refUrl = `${process.env['FRONTEND_URL'] ?? 'https://tabilize.com.br'}/ref/${updated.slug}`;
    this.mail
      .sendPartnerApproved(updated.email, updated.name, updated.slug, refUrl)
      .catch(() => null);

    return updated;
  }

  async reject(partnerId: string, dto: RejectPartnerDto) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
    });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');

    const updated = await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        status: PartnerStatus.REJECTED,
        rejectedReason: dto.reason,
      },
      select: PARTNER_SAFE_SELECT,
    });

    this.mail
      .sendPartnerRejected(updated.email, updated.name, dto.reason)
      .catch(() => null);

    return updated;
  }

  async suspend(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
    });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');

    return this.prisma.partner.update({
      where: { id: partnerId },
      data: { status: PartnerStatus.SUSPENDED },
      select: PARTNER_SAFE_SELECT,
    });
  }

  async updateAdmin(partnerId: string, dto: UpdatePartnerDto) {
    if (dto.slug) {
      const existing = await this.prisma.partner.findUnique({
        where: { slug: dto.slug },
      });
      if (existing && existing.id !== partnerId) {
        throw new ConflictException('Slug já está em uso');
      }
    }

    try {
      return await this.prisma.partner.update({
        where: { id: partnerId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
          ...(dto.commissionPct !== undefined
            ? { commissionPct: dto.commissionPct }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: PARTNER_SAFE_SELECT,
      });
    } catch {
      throw new NotFoundException('Parceiro não encontrado');
    }
  }

  // ── ADMIN: materiais ─────────────────────────────────────────────────────

  async listMaterialsAdmin() {
    return this.prisma.partnerMaterial.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createMaterial(dto: UpsertMaterialDto) {
    return this.prisma.partnerMaterial.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        url: dto.url,
        content: dto.content,
        order: dto.order ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateMaterial(materialId: string, dto: UpsertMaterialDto) {
    try {
      return await this.prisma.partnerMaterial.update({
        where: { id: materialId },
        data: {
          title: dto.title,
          description: dto.description,
          type: dto.type,
          url: dto.url,
          content: dto.content,
          ...(dto.order !== undefined ? { order: dto.order } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch {
      throw new NotFoundException('Material não encontrado');
    }
  }

  async deleteMaterial(materialId: string) {
    try {
      await this.prisma.partnerMaterial.delete({ where: { id: materialId } });
      return { message: 'Material removido' };
    } catch {
      throw new NotFoundException('Material não encontrado');
    }
  }

  // ── PARTNER: dashboard + materiais ───────────────────────────────────────

  async listMaterialsForPartner() {
    return this.prisma.partnerMaterial.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async dashboard(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        name: true,
        slug: true,
        commissionPct: true,
        status: true,
        clicks: true,
      },
    });
    if (!partner) throw new NotFoundException('Parceiro não encontrado');

    const [referredTotal, referredActive, referredTrial, leadStats] =
      await Promise.all([
        this.prisma.team.count({ where: { referredByPartnerId: partnerId } }),
        this.prisma.team.count({
          where: {
            referredByPartnerId: partnerId,
            subscriptionStatus: 'ACTIVE',
          },
        }),
        this.prisma.team.count({
          where: {
            referredByPartnerId: partnerId,
            subscriptionStatus: 'TRIAL',
          },
        }),
        this.leads.countForPartner(partnerId),
      ]);

    const refUrl = `${process.env['FRONTEND_URL'] ?? 'https://tabilize.com.br'}/ref/${partner.slug}`;

    return {
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        commissionPct: partner.commissionPct,
        status: partner.status,
        refUrl,
      },
      stats: {
        clicks: partner.clicks,
        referredTotal,
        referredActive,
        referredTrial,
        leads: leadStats,
      },
    };
  }

  async listReferredTeams(partnerId: string) {
    return this.prisma.team.findMany({
      where: { referredByPartnerId: partnerId },
      select: {
        id: true,
        name: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── PÚBLICO: tracking ────────────────────────────────────────────────────

  async trackBySlug(slug: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        isActive: true,
      },
    });

    if (
      !partner ||
      !partner.isActive ||
      partner.status !== PartnerStatus.APPROVED
    ) {
      return null;
    }

    await this.prisma.partner.update({
      where: { id: partner.id },
      data: { clicks: { increment: 1 } },
    });

    return {
      partnerId: partner.id,
      slug: partner.slug,
      name: partner.name,
    };
  }
}
