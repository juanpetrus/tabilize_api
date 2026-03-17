import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto.js';

const srInclude = {
  company: { select: { id: true, name: true } },
  companyUser: { select: { id: true, name: true, email: true } },
};

@Injectable()
export class ServiceRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  // Cliente abre um pedido
  async create(companyUserId: string, companyId: string, dto: CreateServiceRequestDto) {
    await this.ensureCompanyUser(companyId, companyUserId);

    return this.prisma.serviceRequest.create({
      data: {
        companyId,
        companyUserId,
        title: dto.title,
        description: dto.description,
      },
      include: srInclude,
    });
  }

  // Cliente vê seus pedidos
  async findAllForClient(companyUserId: string, companyId: string) {
    await this.ensureCompanyUser(companyId, companyUserId);

    return this.prisma.serviceRequest.findMany({
      where: { companyId, companyUserId, isActive: true },
      include: srInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Contador vê todos os pedidos de uma empresa
  async findAllForTeam(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    return this.prisma.serviceRequest.findMany({
      where: { companyId, isActive: true },
      include: srInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Contador vê todos os pedidos abertos do escritório
  async findAllByTeam(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.serviceRequest.findMany({
      where: { company: { teamId }, isActive: true },
      include: srInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  // Contador atualiza status
  async updateStatus(
    teamId: string,
    companyId: string,
    requestId: string,
    userId: string,
    dto: UpdateServiceRequestStatusDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const sr = await this.prisma.serviceRequest.findFirst({
      where: { id: requestId, companyId, isActive: true },
    });

    if (!sr) throw new NotFoundException('Pedido não encontrado');

    return this.prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: dto.status },
      include: srInclude,
    });
  }

  private async ensureCompanyUser(companyId: string, companyUserId: string) {
    const companyUser = await this.prisma.companyUser.findFirst({
      where: { id: companyUserId, companyId, isActive: true },
    });

    if (!companyUser) throw new ForbiddenException('Acesso negado');
  }

  private async ensureAccess(teamId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');
  }

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
  }
}
