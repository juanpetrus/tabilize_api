import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Listar produtos de uma empresa (paginado) ────────────────────────────

  async findAllByCompany(
    teamId: string,
    companyId: string,
    userId: string,
    options: { search?: string; page?: number; pageSize?: number } = {},
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const search = options.search?.trim();
    const page =
      Number.isFinite(options.page) && (options.page as number) > 0
        ? Math.trunc(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
        ? Math.min(100, Math.trunc(options.pageSize as number))
        : 20;

    const where = {
      companyId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { descricao: { contains: search, mode: 'insensitive' as const } },
              { codigoInterno: { contains: search } },
              { codigoBarras: { contains: search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { descricao: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
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

  // ─── Buscar produto específico ────────────────────────────────────────────

  async findOne(
    teamId: string,
    companyId: string,
    productId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId, isActive: true },
      include: {
        ncm: { select: { codigo: true, descricao: true } },
        cfop: { select: { codigo: true, descricao: true } },
        cstIcms: { select: { codigo: true, descricao: true } },
        csosn: { select: { codigo: true, descricao: true } },
      },
    });

    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }

  // ─── Criar produto ────────────────────────────────────────────────────────

  async create(
    teamId: string,
    companyId: string,
    userId: string,
    dto: CreateProductDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    await this.validateCatalogRefs(dto);

    const existing = await this.prisma.product.findUnique({
      where: {
        companyId_codigoInterno: { companyId, codigoInterno: dto.codigoInterno },
      },
    });
    if (existing) {
      throw new ConflictException('Código interno já cadastrado nesta empresa');
    }

    return this.prisma.product.create({
      data: {
        companyId,
        codigoInterno: dto.codigoInterno,
        codigoBarras: dto.codigoBarras,
        descricao: dto.descricao,
        ncmCodigo: dto.ncmCodigo,
        cestCodigo: dto.cestCodigo,
        cfopPadrao: dto.cfopPadrao,
        unidade: dto.unidade,
        origem: dto.origem,
        cstIcmsPadrao: dto.cstIcmsPadrao,
        csosnPadrao: dto.csosnPadrao,
        aliquotaIcms: dto.aliquotaIcms,
        aliquotaPis: dto.aliquotaPis,
        aliquotaCofins: dto.aliquotaCofins,
        aliquotaIpi: dto.aliquotaIpi,
        precoVenda: dto.precoVenda,
        precoCusto: dto.precoCusto,
      },
    });
  }

  // ─── Atualizar produto ────────────────────────────────────────────────────

  async update(
    teamId: string,
    companyId: string,
    productId: string,
    userId: string,
    dto: UpdateProductDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId, isActive: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    await this.validateCatalogRefs(dto);

    // Se codigoInterno está sendo alterado, verifica unicidade
    if (dto.codigoInterno && dto.codigoInterno !== product.codigoInterno) {
      const existing = await this.prisma.product.findUnique({
        where: {
          companyId_codigoInterno: {
            companyId,
            codigoInterno: dto.codigoInterno,
          },
        },
      });
      if (existing) {
        throw new ConflictException('Código interno já cadastrado nesta empresa');
      }
    }

    return this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.codigoInterno !== undefined && {
          codigoInterno: dto.codigoInterno,
        }),
        ...(dto.codigoBarras !== undefined && { codigoBarras: dto.codigoBarras }),
        ...(dto.descricao !== undefined && { descricao: dto.descricao }),
        ...(dto.ncmCodigo !== undefined && { ncmCodigo: dto.ncmCodigo }),
        ...(dto.cestCodigo !== undefined && { cestCodigo: dto.cestCodigo }),
        ...(dto.cfopPadrao !== undefined && { cfopPadrao: dto.cfopPadrao }),
        ...(dto.unidade !== undefined && { unidade: dto.unidade }),
        ...(dto.origem !== undefined && { origem: dto.origem }),
        ...(dto.cstIcmsPadrao !== undefined && {
          cstIcmsPadrao: dto.cstIcmsPadrao,
        }),
        ...(dto.csosnPadrao !== undefined && { csosnPadrao: dto.csosnPadrao }),
        ...(dto.aliquotaIcms !== undefined && { aliquotaIcms: dto.aliquotaIcms }),
        ...(dto.aliquotaPis !== undefined && { aliquotaPis: dto.aliquotaPis }),
        ...(dto.aliquotaCofins !== undefined && {
          aliquotaCofins: dto.aliquotaCofins,
        }),
        ...(dto.aliquotaIpi !== undefined && { aliquotaIpi: dto.aliquotaIpi }),
        ...(dto.precoVenda !== undefined && { precoVenda: dto.precoVenda }),
        ...(dto.precoCusto !== undefined && { precoCusto: dto.precoCusto }),
      },
    });
  }

  // ─── Remover produto (soft delete) ───────────────────────────────────────

  async remove(
    teamId: string,
    companyId: string,
    productId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId, isActive: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    return this.prisma.product.update({
      where: { id: productId },
      data: { isActive: false },
    });
  }

  // ─── Validação de referências de catálogos ────────────────────────────────

  private async validateCatalogRefs(dto: {
    ncmCodigo?: string;
    cfopPadrao?: string;
    cstIcmsPadrao?: string;
    csosnPadrao?: string;
  }) {
    if (dto.ncmCodigo) {
      const ncm = await this.prisma.ncmCode.findUnique({
        where: { codigo: dto.ncmCodigo },
      });
      if (!ncm) {
        throw new BadRequestException(`NCM inválido: ${dto.ncmCodigo}`);
      }
    }

    if (dto.cfopPadrao) {
      const cfop = await this.prisma.cfopCode.findUnique({
        where: { codigo: dto.cfopPadrao },
      });
      if (!cfop) {
        throw new BadRequestException(`CFOP inválido: ${dto.cfopPadrao}`);
      }
    }

    if (dto.cstIcmsPadrao) {
      const cst = await this.prisma.cstIcmsCode.findUnique({
        where: { codigo: dto.cstIcmsPadrao },
      });
      if (!cst) {
        throw new BadRequestException(`CST ICMS inválido: ${dto.cstIcmsPadrao}`);
      }
    }

    if (dto.csosnPadrao) {
      const csosn = await this.prisma.csosnCode.findUnique({
        where: { codigo: dto.csosnPadrao },
      });
      if (!csosn) {
        throw new BadRequestException(`CSOSN inválido: ${dto.csosnPadrao}`);
      }
    }
  }

  // ─── Helpers de autorização ───────────────────────────────────────────────

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
