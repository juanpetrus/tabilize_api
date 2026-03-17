import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

const taskInclude = {
  company: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
};

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, companyId: string, userId: string, dto: CreateTaskDto) {
    await this.ensureAccess(teamId, companyId, userId);

    return this.prisma.task.create({
      data: {
        teamId,
        companyId,
        creatorId: userId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: taskInclude,
    });
  }

  async findAll(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    return this.prisma.task.findMany({
      where: { companyId, teamId, isActive: true },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllByTeam(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.task.findMany({
      where: { teamId, isActive: true },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(teamId: string, companyId: string, taskId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId, teamId, isActive: true },
      include: taskInclude,
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    return task;
  }

  async update(
    teamId: string,
    companyId: string,
    taskId: string,
    userId: string,
    dto: UpdateTaskDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId, teamId, isActive: true },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    return this.prisma.task.update({
      where: { id: taskId },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: taskInclude,
    });
  }

  async remove(teamId: string, companyId: string, taskId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, companyId, teamId, isActive: true },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    return this.prisma.task.update({
      where: { id: taskId },
      data: { isActive: false },
    });
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
