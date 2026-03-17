import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { UpdateDocumentDto } from './dto/update-document.dto.js';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async create(
    teamId: string,
    companyId: string,
    userId: string,
    dto: CreateDocumentDto,
    file?: Express.Multer.File,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    let fileUrl = dto.fileUrl;
    if (file) {
      fileUrl = await this.storage.upload(file, `teams/${teamId}/companies/${companyId}`);
    }

    return this.prisma.document.create({
      data: {
        companyId,
        name: dto.name,
        type: dto.type,
        fileUrl,
        description: dto.description,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async findAll(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    return this.prisma.document.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Acesso pelo portal cliente
  async findAllForClient(companyId: string, companyUserId: string) {
    await this.ensureCompanyUser(companyId, companyUserId);

    return this.prisma.document.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(teamId: string, companyId: string, documentId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, companyId, isActive: true },
    });

    if (!doc) throw new NotFoundException('Documento não encontrado');

    return doc;
  }

  async update(
    teamId: string,
    companyId: string,
    documentId: string,
    userId: string,
    dto: UpdateDocumentDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, companyId, isActive: true },
    });

    if (!doc) throw new NotFoundException('Documento não encontrado');

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
    });
  }

  async remove(teamId: string, companyId: string, documentId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const doc = await this.prisma.document.findFirst({
      where: { id: documentId, companyId, isActive: true },
    });

    if (!doc) throw new NotFoundException('Documento não encontrado');

    return this.prisma.document.update({
      where: { id: documentId },
      data: { isActive: false },
    });
  }

  private async ensureAccess(teamId: string, companyId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');
  }

  private async ensureCompanyUser(companyId: string, companyUserId: string) {
    const companyUser = await this.prisma.companyUser.findFirst({
      where: { id: companyUserId, companyId, isActive: true },
    });

    if (!companyUser) throw new ForbiddenException('Acesso negado');
  }
}
