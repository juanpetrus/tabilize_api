import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto.js';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto.js';

const taskInclude = {
  board: { select: { id: true, name: true } },
  company: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true, email: true } },
  assignee: { select: { id: true, name: true, email: true } },
  checklistItems: { orderBy: { order: 'asc' as const } },
  subtasks: {
    where: { isActive: true },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assignee: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
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

    if (dto.parentId) {
      await this.ensureParentTaskExists(teamId, dto.parentId, dto.boardId);
    }

    return this.prisma.task.create({
      data: {
        teamId,
        boardId: dto.boardId,
        companyId: dto.companyId,
        creatorId: userId,
        parentId: dto.parentId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: taskInclude,
    });
  }

  async findAllByTeam(teamId: string, userId: string, boardId?: string, companyId?: string, assigneeId?: string, includeSubtasks?: boolean) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.task.findMany({
      where: {
        teamId,
        isActive: true,
        parentId: includeSubtasks ? undefined : null,
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

    // Validate parentId if being updated
    if (dto.parentId !== undefined) {
      if (dto.parentId === taskId) {
        throw new BadRequestException('Uma tarefa não pode ser sua própria subtarefa');
      }

      if (dto.parentId !== null) {
        const parent = await this.prisma.task.findFirst({
          where: { id: dto.parentId, teamId, boardId: task.boardId, isActive: true },
        });

        if (!parent) throw new BadRequestException('Tarefa pai não encontrada');

        // Check for circular reference
        if (parent.parentId === taskId) {
          throw new BadRequestException('Referência circular detectada');
        }
      }
    }

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

  private async ensureParentTaskExists(teamId: string, parentId: string, boardId: string) {
    const parent = await this.prisma.task.findFirst({
      where: { id: parentId, teamId, boardId, isActive: true },
    });

    if (!parent) throw new BadRequestException('Tarefa pai não encontrada');
  }

  private async ensureTaskBelongsToTeam(teamId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, teamId, isActive: true },
    });

    if (!task) throw new NotFoundException('Tarefa não encontrada');
    return task;
  }

  // ─── Checklist Methods ─────────────────────────────────────────────────────

  async createChecklistItem(teamId: string, taskId: string, userId: string, dto: CreateChecklistItemDto) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureTaskBelongsToTeam(teamId, taskId);

    const maxOrder = await this.prisma.taskChecklistItem.aggregate({
      where: { taskId },
      _max: { order: true },
    });

    return this.prisma.taskChecklistItem.create({
      data: {
        taskId,
        text: dto.text,
        order: dto.order ?? (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async findAllChecklistItems(teamId: string, taskId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureTaskBelongsToTeam(teamId, taskId);

    return this.prisma.taskChecklistItem.findMany({
      where: { taskId },
      orderBy: { order: 'asc' },
    });
  }

  async updateChecklistItem(teamId: string, taskId: string, itemId: string, userId: string, dto: UpdateChecklistItemDto) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureTaskBelongsToTeam(teamId, taskId);

    const item = await this.prisma.taskChecklistItem.findFirst({
      where: { id: itemId, taskId },
    });

    if (!item) throw new NotFoundException('Item do checklist não encontrado');

    return this.prisma.taskChecklistItem.update({
      where: { id: itemId },
      data: dto,
    });
  }

  async toggleChecklistItem(teamId: string, taskId: string, itemId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureTaskBelongsToTeam(teamId, taskId);

    const item = await this.prisma.taskChecklistItem.findFirst({
      where: { id: itemId, taskId },
    });

    if (!item) throw new NotFoundException('Item do checklist não encontrado');

    return this.prisma.taskChecklistItem.update({
      where: { id: itemId },
      data: { completed: !item.completed },
    });
  }

  async removeChecklistItem(teamId: string, taskId: string, itemId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureTaskBelongsToTeam(teamId, taskId);

    const item = await this.prisma.taskChecklistItem.findFirst({
      where: { id: itemId, taskId },
    });

    if (!item) throw new NotFoundException('Item do checklist não encontrado');

    return this.prisma.taskChecklistItem.delete({
      where: { id: itemId },
    });
  }
}
