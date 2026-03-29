import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { BoardsService } from './boards.service.js';
import { CreateBoardDto } from './dto/create-board.dto.js';
import { UpdateBoardDto } from './dto/update-board.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/boards')
export class BoardsController {
  constructor(private readonly boardsService: BoardsService) {}

  @Post()
  create(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateBoardDto,
  ) {
    return this.boardsService.create(teamId, req.user.id, dto);
  }

  @Get()
  findAll(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
  ) {
    return this.boardsService.findAllByTeam(teamId, req.user.id);
  }

  @Get(':boardId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('boardId') boardId: string,
    @Req() req: AuthRequest,
  ) {
    return this.boardsService.findOne(teamId, boardId, req.user.id);
  }

  @Patch(':boardId')
  update(
    @Param('teamId') teamId: string,
    @Param('boardId') boardId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateBoardDto,
  ) {
    return this.boardsService.update(teamId, boardId, req.user.id, dto);
  }

  @Delete(':boardId')
  remove(
    @Param('teamId') teamId: string,
    @Param('boardId') boardId: string,
    @Req() req: AuthRequest,
  ) {
    return this.boardsService.remove(teamId, boardId, req.user.id);
  }
}
