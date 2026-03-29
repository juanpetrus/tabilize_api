import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/index.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { InviteMemberDto } from './dto/invite-member.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { TeamRole } from '../../generated/prisma/enums.js';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTeamDto) {
    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        ownerId: userId,
        members: {
          create: {
            userId,
            role: TeamRole.OWNER,
          },
        },
      },
      include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } },
    });

    return team;
  }

  async findMyTeams(userId: string) {
    return this.prisma.team.findMany({
      where: {
        isActive: true,
        members: { some: { userId, isActive: true } },
      },
      include: {
        _count: { select: { members: true, companies: true } },
      },
    });
  }

  async findOne(teamId: string, userId: string) {
    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        isActive: true,
        members: { some: { userId, isActive: true } },
      },
      include: {
        members: {
          where: { isActive: true },
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        _count: { select: { companies: true } },
      },
    });

    if (!team) {
      throw new NotFoundException('Equipe não encontrada');
    }

    return team;
  }

  async inviteMember(teamId: string, requesterId: string, dto: InviteMemberDto) {
    await this.ensureAdminOrOwner(teamId, requesterId);

    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    let tempPassword: string | null = null;

    if (!user) {
      tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      user = await this.prisma.user.create({
        data: { name: dto.name, email: dto.email, password: hashedPassword },
      });
    }

    const existing = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: user.id } },
    });

    if (existing?.isActive) {
      throw new ConflictException('Usuário já é membro dessa equipe');
    }

    const member = existing && !existing.isActive
      ? await this.prisma.teamMember.update({
          where: { id: existing.id },
          data: { isActive: true, role: dto.role },
          include: { user: { select: { id: true, name: true, email: true } } },
        })
      : await this.prisma.teamMember.create({
          data: { teamId, userId: user.id, role: dto.role },
          include: { user: { select: { id: true, name: true, email: true } } },
        });

    return { ...member, ...(tempPassword ? { tempPassword } : {}) };
  }

  async updateMemberRole(
    teamId: string,
    memberId: string,
    requesterId: string,
    dto: UpdateMemberRoleDto,
  ) {
    await this.ensureAdminOrOwner(teamId, requesterId);

    if (dto.role === TeamRole.OWNER) {
      throw new ForbiddenException('Não é possível atribuir o papel OWNER diretamente');
    }

    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, teamId, isActive: true },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    if (member.role === TeamRole.OWNER) {
      throw new ForbiddenException('Não é possível alterar o papel do dono da equipe');
    }

    return this.prisma.teamMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  async removeMember(teamId: string, memberId: string, requesterId: string) {
    await this.ensureAdminOrOwner(teamId, requesterId);

    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, teamId, isActive: true },
    });

    if (!member) {
      throw new NotFoundException('Membro não encontrado');
    }

    if (member.role === TeamRole.OWNER) {
      throw new ForbiddenException('Não é possível remover o dono da equipe');
    }

    return this.prisma.teamMember.update({
      where: { id: memberId },
      data: { isActive: false },
    });
  }

  async updateTeam(teamId: string, userId: string, name: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, ownerId: userId, isActive: true },
    });

    if (!team) throw new ForbiddenException('Apenas o dono pode alterar o nome do escritório');

    return this.prisma.team.update({
      where: { id: teamId },
      data: { name },
      select: { id: true, name: true },
    });
  }

  private async ensureAdminOrOwner(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member || (member.role !== TeamRole.OWNER && member.role !== TeamRole.ADMIN)) {
      throw new ForbiddenException('Acesso negado: você precisa ser OWNER ou ADMIN');
    }

    return member;
  }
}
