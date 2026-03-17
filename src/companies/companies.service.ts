import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
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
        _count: { select: { tasks: true, documents: true, serviceRequests: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(teamId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
      include: {
        _count: { select: { tasks: true, documents: true, serviceRequests: true } },
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

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');

    return member;
  }
}
