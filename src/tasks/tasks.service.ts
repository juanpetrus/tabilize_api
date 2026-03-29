import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

const taskInclude = {
  board: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
};

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, userId: string, dto: CreateTaskDto) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureBoardBelongsToTeam(teamId, dto.boardId);

    if (dto.companyId) {
      await this.ensureCompanyBelongsToTeam(teamId, dto.companyId);
    }

    return this.prisma.task.create({
      data: {
        teamId,
        boardId: dto.boardId,
        companyId: dto.companyId,
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

  async findAllByTeam(teamId: string, userId: string, boardId?: string, companyId?: string, assigneeId?: string) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.task.findMany({
      where: {
        teamId,
        isActive: true,
        ...(boardId ? { boardId } : {}),
        ...(companyId ? { companyId } : {}),
        ...(assigneeId ? { assigneeId } : {}),
      },
      include: taskInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(teamId: string, taskId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, teamId, isActive: true },
      include: taskInclude,
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    return task;
  }

  async update(teamId: string, taskId: string, userId: string, dto: UpdateTaskDto) {
    await this.ensureTeamMember(teamId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, teamId, isActive: true },
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

  async remove(teamId: string, taskId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, teamId, isActive: true },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');

    return this.prisma.task.update({
      where: { id: taskId },
      data: { isActive: false },
    });
  }

  private async ensureBoardBelongsToTeam(teamId: string, boardId: string) {
    const board = await this.prisma.board.findFirst({
      where: { id: boardId, teamId, isActive: true },
    });

    if (!board) throw new BadRequestException('Setor não encontrado neste escritório');
  }

  private async ensureCompanyBelongsToTeam(teamId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });

    if (!company) throw new BadRequestException('Empresa não encontrada neste escritório');
  }

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
  }
}
