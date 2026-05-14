import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { Prisma } from '../../generated/prisma/client.js';
import { TipoContingencia } from '../../generated/prisma/enums.js';
import {
  UpdateFiscalDataDto,
  UpdateFiscalAddressDto,
  UpdateNfeConfigDto,
} from './dto/index.js';

// ─── UFs válidas ──────────────────────────────────────────────────────────────
const VALID_UFS = new Set([
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS',
  'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC',
  'SE', 'SP', 'TO',
]);

// ─── Tipos auxiliares ─────────────────────────────────────────────────────────

export interface TabCompleteness {
  isComplete: boolean;
  missing: string[];
}

export interface Completeness {
  isComplete: boolean;
  tabs: {
    data: TabCompleteness;
    address: TabCompleteness;
    nfe: TabCompleteness;
  };
}

@Injectable()
export class FiscalConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── GET / — retorna tudo ──────────────────────────────────────────────────

  async getAll(teamId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);
    const company = await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const [fiscalProfile, address, nfeConfig] = await Promise.all([
      this.prisma.companyFiscalProfile.findUnique({
        where: { companyId },
        include: { cnae: { select: { codigo: true, descricao: true } } },
      }),
      this.prisma.companyAddress.findUnique({ where: { companyId } }),
      this.prisma.companyNfeConfig.findUnique({ where: { companyId } }),
    ]);

    const completeness = this.calcCompleteness(fiscalProfile, address, nfeConfig);

    return {
      company: { id: company.id, name: company.name, cnpj: company.cnpj },
      fiscalProfile,
      address,
      nfeConfig,
      completeness,
    };
  }

  // ─── PATCH /data ──────────────────────────────────────────────────────────

  async updateData(
    teamId: string,
    companyId: string,
    userId: string,
    dto: UpdateFiscalDataDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    if (dto.cnaePrincipal) {
      const cnaeExists = await this.prisma.cnaeCode.findUnique({
        where: { codigo: dto.cnaePrincipal },
      });
      if (!cnaeExists) throw new BadRequestException('CNAE inválido');
    }

    const fiscalProfile = await this.prisma.companyFiscalProfile.upsert({
      where: { companyId },
      create: { ...dto, companyId },
      update: dto,
      include: { cnae: { select: { codigo: true, descricao: true } } },
    });

    const [address, nfeConfig] = await Promise.all([
      this.prisma.companyAddress.findUnique({ where: { companyId } }),
      this.prisma.companyNfeConfig.findUnique({ where: { companyId } }),
    ]);

    const completeness = this.calcCompleteness(fiscalProfile, address, nfeConfig);

    return { fiscalProfile, completeness };
  }

  // ─── PATCH /address ───────────────────────────────────────────────────────

  async updateAddress(
    teamId: string,
    companyId: string,
    userId: string,
    dto: UpdateFiscalAddressDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    if (dto.uf && !VALID_UFS.has(dto.uf)) {
      throw new BadRequestException('UF inválida');
    }

    const address = await this.prisma.companyAddress.upsert({
      where: { companyId },
      create: { ...dto, companyId },
      update: dto,
    });

    const [fiscalProfile, nfeConfig] = await Promise.all([
      this.prisma.companyFiscalProfile.findUnique({
        where: { companyId },
        include: { cnae: { select: { codigo: true, descricao: true } } },
      }),
      this.prisma.companyNfeConfig.findUnique({ where: { companyId } }),
    ]);

    const completeness = this.calcCompleteness(fiscalProfile, address, nfeConfig);

    return { address, completeness };
  }

  // ─── PATCH /nfe ───────────────────────────────────────────────────────────

  async updateNfe(
    teamId: string,
    companyId: string,
    userId: string,
    dto: UpdateNfeConfigDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    if (
      dto.tipoContingencia &&
      dto.tipoContingencia !== TipoContingencia.NORMAL &&
      !dto.contingenciaJustificativa
    ) {
      // Verificar se já há justificativa salva
      const existing = await this.prisma.companyNfeConfig.findUnique({
        where: { companyId },
        select: { contingenciaJustificativa: true },
      });

      if (
        !existing?.contingenciaJustificativa ||
        existing.contingenciaJustificativa.length < 15
      ) {
        throw new BadRequestException(
          'Justificativa de contingência obrigatória (mín. 15 caracteres)',
        );
      }
    }

    const { contingenciaInicio, ...rest } = dto;
    const data: Prisma.CompanyNfeConfigUncheckedUpdateInput = {
      ...rest,
      ...(contingenciaInicio !== undefined && {
        contingenciaInicio: contingenciaInicio ? new Date(contingenciaInicio) : null,
      }),
    };

    const nfeConfig = await this.prisma.companyNfeConfig.upsert({
      where: { companyId },
      create: { ...data, companyId } as Prisma.CompanyNfeConfigUncheckedCreateInput,
      update: data,
    });

    const [fiscalProfile, address] = await Promise.all([
      this.prisma.companyFiscalProfile.findUnique({
        where: { companyId },
        include: { cnae: { select: { codigo: true, descricao: true } } },
      }),
      this.prisma.companyAddress.findUnique({ where: { companyId } }),
    ]);

    const completeness = this.calcCompleteness(fiscalProfile, address, nfeConfig);

    return { nfeConfig, completeness };
  }

  // ─── Cálculo de completeness ──────────────────────────────────────────────

  private calcCompleteness(
    fiscalProfile: { crt?: string | null; nomeFantasia?: string | null; estabelecimento?: string | null; indicadorAtividade?: string | null; inscricaoEstadual?: string | null } | null,
    address: { logradouro?: string | null; numero?: string | null; bairro?: string | null; cep?: string | null; codIbgeMunicipio?: string | null; municipio?: string | null; uf?: string | null } | null,
    nfeConfig: { serie?: string | null; ambiente?: string | null; tipoContingencia?: string | null; contingenciaJustificativa?: string | null } | null,
  ): Completeness {
    // Tab data
    const dataMissing: string[] = [];
    if (!fiscalProfile?.crt) dataMissing.push('crt');
    if (!fiscalProfile?.nomeFantasia) dataMissing.push('nomeFantasia');
    if (!fiscalProfile?.estabelecimento) dataMissing.push('estabelecimento');
    if (!fiscalProfile?.indicadorAtividade) dataMissing.push('indicadorAtividade');
    if (!fiscalProfile?.inscricaoEstadual) dataMissing.push('inscricaoEstadual');

    // Tab address
    const addressMissing: string[] = [];
    if (!address?.logradouro) addressMissing.push('logradouro');
    if (!address?.numero) addressMissing.push('numero');
    if (!address?.bairro) addressMissing.push('bairro');
    if (!address?.cep || !/^\d{8}$/.test(address.cep)) addressMissing.push('cep');
    if (!address?.codIbgeMunicipio || !/^\d{7}$/.test(address.codIbgeMunicipio))
      addressMissing.push('codIbgeMunicipio');
    if (!address?.municipio) addressMissing.push('municipio');
    if (!address?.uf || address.uf.length !== 2) addressMissing.push('uf');

    // Tab nfe
    const nfeMissing: string[] = [];
    if (!nfeConfig?.serie) nfeMissing.push('serie');
    if (!nfeConfig?.ambiente) nfeMissing.push('ambiente');
    if (
      nfeConfig?.tipoContingencia &&
      nfeConfig.tipoContingencia !== TipoContingencia.NORMAL
    ) {
      if (
        !nfeConfig.contingenciaJustificativa ||
        nfeConfig.contingenciaJustificativa.length < 15
      ) {
        nfeMissing.push('contingenciaJustificativa');
      }
    }

    const tabs = {
      data: { isComplete: dataMissing.length === 0, missing: dataMissing },
      address: { isComplete: addressMissing.length === 0, missing: addressMissing },
      nfe: { isComplete: nfeMissing.length === 0, missing: nfeMissing },
    };

    return {
      isComplete: tabs.data.isComplete && tabs.address.isComplete && tabs.nfe.isComplete,
      tabs,
    };
  }

  // ─── Helpers de autorização ────────────────────────────────────────────────

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
