import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateLandingPageDto } from './dto/create-landing-page.dto.js';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto.js';

@Injectable()
export class LandingPagesService {
  constructor(private readonly prisma: PrismaService) {}

  // ── ADMIN ────────────────────────────────────────────────────────────────

  async listAdmin() {
    return this.prisma.landingPage.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreateLandingPageDto) {
    return this.prisma.landingPage.create({
      data: {
        title: dto.title,
        description: dto.description,
        url: dto.url,
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async update(id: string, dto: UpdateLandingPageDto) {
    try {
      return await this.prisma.landingPage.update({
        where: { id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.url !== undefined ? { url: dto.url } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch {
      throw new NotFoundException('Landing page não encontrada');
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.landingPage.delete({ where: { id } });
      return { message: 'Landing page removida' };
    } catch {
      throw new NotFoundException('Landing page não encontrada');
    }
  }

  // ── PARCEIRO ─────────────────────────────────────────────────────────────

  /**
   * Lista LPs ativas e devolve, pra cada uma, a URL já injetada com o ref
   * do parceiro (`?ref={slug}`). Preserva query strings existentes.
   */
  async listForPartner(partnerSlug: string) {
    const pages = await this.prisma.landingPage.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });

    return pages.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      url: p.url,
      refUrl: appendRefParam(p.url, partnerSlug),
    }));
  }
}

function appendRefParam(url: string, slug: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set('ref', slug);
    return u.toString();
  } catch {
    // fallback caso a URL não passe no parse (não deveria, validamos no DTO)
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}ref=${encodeURIComponent(slug)}`;
  }
}
