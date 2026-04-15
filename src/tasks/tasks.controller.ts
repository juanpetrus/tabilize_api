import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto.js';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(teamId, req.user.id, dto);
  }

  @Get()
  findAll(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Query('boardId') boardId?: string,
    @Query('companyId') companyId?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('includeSubtasks') includeSubtasks?: string,
  ) {
    return this.tasksService.findAllByTeam(teamId, req.user.id, boardId, companyId, assigneeId, includeSubtasks === 'true');
  }

  @Get(':taskId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.findOne(teamId, taskId, req.user.id);
  }

  @Patch(':taskId')
  update(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(teamId, taskId, req.user.id, dto);
  }

  @Delete(':taskId')
  remove(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.remove(teamId, taskId, req.user.id);
  }

  // ─── Checklist Endpoints ─────────────────────────────────────────────────────

  @Post(':taskId/checklist')
  createChecklistItem(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.tasksService.createChecklistItem(teamId, taskId, req.user.id, dto);
  }

  @Get(':taskId/checklist')
  findAllChecklistItems(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.findAllChecklistItems(teamId, taskId, req.user.id);
  }

  @Patch(':taskId/checklist/:itemId')
  updateChecklistItem(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.tasksService.updateChecklistItem(teamId, taskId, itemId, req.user.id, dto);
  }

  @Patch(':taskId/checklist/:itemId/toggle')
  toggleChecklistItem(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.toggleChecklistItem(teamId, taskId, itemId, req.user.id);
  }

  @Delete(':taskId/checklist/:itemId')
  removeChecklistItem(
    @Param('teamId') teamId: string,
    @Param('taskId') taskId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.removeChecklistItem(teamId, taskId, itemId, req.user.id);
  }
}
