import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../database/index.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, userId: string, dto: CreateCompanyDto) {
    await this.ensureTeamMember(teamId, userId);

    if (dto.cnpj) {
      const existing = await this.prisma.company.findUnique({ where: { cnpj: dto.cnpj } });
      if (existing) throw new ConflictException('CNPJ já cadastrado');
    }

    return this.prisma.company.create({
      data: { ...dto, teamId },
    });
  }

  async findAll(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.company.findMany({
      where: { teamId, isActive: true },
      include: {
        _count: { select: { tasks: true, driveShares: true, serviceRequests: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(teamId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
      include: {
        _count: { select: { tasks: true, driveShares: true, serviceRequests: true } },
        companyUsers: {
          where: { isActive: true },
          select: { id: true, name: true, email: true, createdAt: true },
        },
      },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    return company;
  }

  async update(teamId: string, companyId: string, userId: string, dto: UpdateCompanyDto) {
    await this.ensureTeamMember(teamId, userId);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    if (dto.cnpj && dto.cnpj !== company.cnpj) {
      const cnpjTaken = await this.prisma.company.findUnique({ where: { cnpj: dto.cnpj } });
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
        const existing = await this.prisma.company.findUnique({ where: { cnpj } });
        if (existing) {
          skipped.push({ row: i + 2, name, reason: 'CNPJ já cadastrado' });
          continue;
        }
      }

      await this.prisma.company.create({
        data: { teamId, name, cnpj, email, phone, address },
      });

      imported.push(name);
    }

    return { imported: imported.length, skipped };
  }

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');

    return member;
  }
}
