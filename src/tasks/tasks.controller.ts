import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
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
    @Query('companyId') companyId?: string,
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.tasksService.findAllByTeam(teamId, req.user.id, companyId, assigneeId);
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
}
