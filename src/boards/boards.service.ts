import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreateBoardDto } from './dto/create-board.dto.js';
import { UpdateBoardDto } from './dto/update-board.dto.js';

@Injectable()
export class BoardsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, userId: string, dto: CreateBoardDto) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.board.create({
      data: { teamId, name: dto.name },
    });
  }

  async findAllByTeam(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.board.findMany({
      where: { teamId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(teamId: string, boardId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const board = await this.prisma.board.findFirst({
      where: { id: boardId, teamId, isActive: true },
    });

    if (!board) throw new NotFoundException('Setor não encontrado');

    return board;
  }

  async update(teamId: string, boardId: string, userId: string, dto: UpdateBoardDto) {
    await this.ensureTeamMember(teamId, userId);

    const board = await this.prisma.board.findFirst({
      where: { id: boardId, teamId, isActive: true },
    });

    if (!board) throw new NotFoundException('Setor não encontrado');

    return this.prisma.board.update({
      where: { id: boardId },
      data: dto,
    });
  }

  async remove(teamId: string, boardId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const board = await this.prisma.board.findFirst({
      where: { id: boardId, teamId, isActive: true },
    });

    if (!board) throw new NotFoundException('Setor não encontrado');

    return this.prisma.board.update({
      where: { id: boardId },
      data: { isActive: false },
    });
  }

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
  }
}
