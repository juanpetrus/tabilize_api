import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';

@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(teamId: string, userId: string, file: Express.Multer.File) {
    await this.ensureTeamMember(teamId, userId);

    const fileUrl = await this.storage.upload(file, `teams/${teamId}/drive`);

    return this.prisma.driveFile.create({
      data: {
        teamId,
        name: file.originalname,
        fileUrl,
        mimeType: file.mimetype,
        size: file.size,
      },
    });
  }

  async findAll(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.driveFile.findMany({
      where: { teamId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(teamId: string, fileId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const file = await this.prisma.driveFile.findFirst({
      where: { id: fileId, teamId, isActive: true },
    });

    if (!file) throw new NotFoundException('Arquivo não encontrado');

    await this.storage.delete(file.fileUrl).catch(() => null);

    return this.prisma.driveFile.delete({ where: { id: fileId } });
  }

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
  }
}
