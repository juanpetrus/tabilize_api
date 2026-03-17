import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  create(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(teamId, companyId, req.user.id, dto);
  }

  @Get()
  findAll(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.findAll(teamId, companyId, req.user.id);
  }

  @Get(':taskId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.findOne(teamId, companyId, taskId, req.user.id);
  }

  @Patch(':taskId')
  update(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(teamId, companyId, taskId, req.user.id, dto);
  }

  @Delete(':taskId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('taskId') taskId: string,
    @Req() req: AuthRequest,
  ) {
    return this.tasksService.remove(teamId, companyId, taskId, req.user.id);
  }
}

// Listar todas as tarefas do escritório (visão geral)
@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/tasks')
export class TeamTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  findAll(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.tasksService.findAllByTeam(teamId, req.user.id);
  }
}
