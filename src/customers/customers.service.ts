import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import {
  IndicadorIeDestinatario,
  TipoPessoa,
} from '../../generated/prisma/enums.js';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Listar clientes de uma empresa (paginado) ────────────────────────────

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
              { name: { contains: search, mode: 'insensitive' as const } },
              { cpfCnpj: { contains: search.replace(/\D/g, '') } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
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

  // ─── Buscar um cliente específico ────────────────────────────────────────

  async findOne(
    teamId: string,
    companyId: string,
    customerId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId, isActive: true },
    });

    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }

  // ─── Criar cliente ───────────────────────────────────────────────────────

  async create(
    teamId: string,
    companyId: string,
    userId: string,
    dto: CreateCustomerDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    // Valida tamanho do CPF/CNPJ conforme tipoPessoa
    if (dto.tipoPessoa === TipoPessoa.PF && dto.cpfCnpj.length !== 11) {
      throw new BadRequestException('CPF deve ter 11 dígitos para Pessoa Física');
    }
    if (dto.tipoPessoa === TipoPessoa.PJ && dto.cpfCnpj.length !== 14) {
      throw new BadRequestException('CNPJ deve ter 14 dígitos para Pessoa Jurídica');
    }

    this.validateBusinessRules({
      tipoPessoa: dto.tipoPessoa,
      nomeFantasia: dto.nomeFantasia,
      inscricaoEstadual: dto.inscricaoEstadual,
      indicadorIe: dto.indicadorIe,
    });

    const existing = await this.prisma.customer.findUnique({
      where: { companyId_cpfCnpj: { companyId, cpfCnpj: dto.cpfCnpj } },
    });
    if (existing) {
      throw new ConflictException('CPF/CNPJ já cadastrado nesta empresa');
    }

    return this.prisma.customer.create({
      data: {
        companyId,
        tipoPessoa: dto.tipoPessoa,
        cpfCnpj: dto.cpfCnpj,
        name: dto.name,
        nomeFantasia: dto.nomeFantasia,
        inscricaoEstadual: dto.inscricaoEstadual,
        indicadorIe: dto.indicadorIe ?? IndicadorIeDestinatario.NAO_CONTRIBUINTE,
        inscricaoSuframa: dto.inscricaoSuframa,
        email: dto.email,
        phone: dto.phone,
        logradouro: dto.logradouro,
        numero: dto.numero,
        complemento: dto.complemento,
        bairro: dto.bairro,
        cep: dto.cep,
        codIbgeMunicipio: dto.codIbgeMunicipio,
        municipio: dto.municipio,
        uf: dto.uf,
        codPais: dto.codPais,
        pais: dto.pais,
        notes: dto.notes,
      },
    });
  }

  // ─── Atualizar cliente ───────────────────────────────────────────────────

  async update(
    teamId: string,
    companyId: string,
    customerId: string,
    userId: string,
    dto: UpdateCustomerDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId, isActive: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    // Monta estado final para validações cruzadas
    const finalTipoPessoa = dto.tipoPessoa ?? customer.tipoPessoa;
    const finalCpfCnpj = dto.cpfCnpj ?? customer.cpfCnpj;
    const finalNomeFantasia =
      dto.nomeFantasia !== undefined ? dto.nomeFantasia : customer.nomeFantasia;
    const finalInscricaoEstadual =
      dto.inscricaoEstadual !== undefined
        ? dto.inscricaoEstadual
        : customer.inscricaoEstadual;
    const finalIndicadorIe =
      dto.indicadorIe !== undefined ? dto.indicadorIe : customer.indicadorIe;

    // Valida tamanho do CPF/CNPJ conforme tipoPessoa final
    if (finalTipoPessoa === TipoPessoa.PF && finalCpfCnpj.length !== 11) {
      throw new BadRequestException('CPF deve ter 11 dígitos para Pessoa Física');
    }
    if (finalTipoPessoa === TipoPessoa.PJ && finalCpfCnpj.length !== 14) {
      throw new BadRequestException('CNPJ deve ter 14 dígitos para Pessoa Jurídica');
    }

    this.validateBusinessRules({
      tipoPessoa: finalTipoPessoa,
      nomeFantasia: finalNomeFantasia,
      inscricaoEstadual: finalInscricaoEstadual,
      indicadorIe: finalIndicadorIe,
    });

    // Se cpfCnpj está sendo alterado, verifica unicidade
    if (dto.cpfCnpj && dto.cpfCnpj !== customer.cpfCnpj) {
      const existing = await this.prisma.customer.findUnique({
        where: { companyId_cpfCnpj: { companyId, cpfCnpj: dto.cpfCnpj } },
      });
      if (existing) {
        throw new ConflictException('CPF/CNPJ já cadastrado nesta empresa');
      }
    }

    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto.tipoPessoa !== undefined && { tipoPessoa: dto.tipoPessoa }),
        ...(dto.cpfCnpj !== undefined && { cpfCnpj: dto.cpfCnpj }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.nomeFantasia !== undefined && { nomeFantasia: dto.nomeFantasia }),
        ...(dto.inscricaoEstadual !== undefined && {
          inscricaoEstadual: dto.inscricaoEstadual,
        }),
        ...(dto.indicadorIe !== undefined && { indicadorIe: dto.indicadorIe }),
        ...(dto.inscricaoSuframa !== undefined && {
          inscricaoSuframa: dto.inscricaoSuframa,
        }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.logradouro !== undefined && { logradouro: dto.logradouro }),
        ...(dto.numero !== undefined && { numero: dto.numero }),
        ...(dto.complemento !== undefined && { complemento: dto.complemento }),
        ...(dto.bairro !== undefined && { bairro: dto.bairro }),
        ...(dto.cep !== undefined && { cep: dto.cep }),
        ...(dto.codIbgeMunicipio !== undefined && {
          codIbgeMunicipio: dto.codIbgeMunicipio,
        }),
        ...(dto.municipio !== undefined && { municipio: dto.municipio }),
        ...(dto.uf !== undefined && { uf: dto.uf }),
        ...(dto.codPais !== undefined && { codPais: dto.codPais }),
        ...(dto.pais !== undefined && { pais: dto.pais }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  // ─── Remover cliente (soft delete) ───────────────────────────────────────

  async remove(
    teamId: string,
    companyId: string,
    customerId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId, isActive: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');

    return this.prisma.customer.update({
      where: { id: customerId },
      data: { isActive: false },
    });
  }

  // ─── Validações de regra de negócio ──────────────────────────────────────

  private validateBusinessRules(dto: {
    tipoPessoa: TipoPessoa;
    nomeFantasia?: string | null;
    inscricaoEstadual?: string | null;
    indicadorIe?: IndicadorIeDestinatario | null;
  }) {
    if (dto.tipoPessoa === TipoPessoa.PF) {
      if (dto.nomeFantasia) {
        throw new BadRequestException('Nome fantasia só é válido para PJ');
      }
      if (dto.inscricaoEstadual) {
        throw new BadRequestException(
          'Inscrição Estadual não é válida para Pessoa Física',
        );
      }
    }

    if (dto.tipoPessoa === TipoPessoa.PJ) {
      const indicadorIe =
        dto.indicadorIe ?? IndicadorIeDestinatario.NAO_CONTRIBUINTE;
      if (
        indicadorIe === IndicadorIeDestinatario.CONTRIBUINTE_ICMS &&
        !dto.inscricaoEstadual
      ) {
        throw new BadRequestException(
          'IE obrigatória para PJ contribuinte ICMS',
        );
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
