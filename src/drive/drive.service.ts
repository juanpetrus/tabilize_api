import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateFolderDto } from './dto/create-folder.dto.js';
import { CreateFileDto } from './dto/create-file.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { ShareItemDto } from './dto/share-item.dto.js';

@Injectable()
export class DriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── Staff: Listar todos os itens ───────────────────────────────────────────

  async findAll(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const items = await this.prisma.driveItem.findMany({
      where: { teamId, isActive: true },
      orderBy: [{ isDirectory: 'desc' }, { name: 'asc' }],
    });

    return items.map(this.formatItem);
  }

  async findByPath(teamId: string, userId: string, path: string) {
    await this.ensureTeamMember(teamId, userId);

    const normalizedPath = this.normalizePath(path);

    const items = await this.prisma.driveItem.findMany({
      where: {
        teamId,
        isActive: true,
        path: { startsWith: normalizedPath === '/' ? '/' : normalizedPath + '/' },
      },
      orderBy: [{ isDirectory: 'desc' }, { name: 'asc' }],
    });

    // Filtrar apenas itens do nível atual (filhos diretos)
    const directChildren = items.filter((item) => {
      const relativePath = normalizedPath === '/' ? item.path : item.path.replace(normalizedPath, '');
      const parts = relativePath.split('/').filter(Boolean);
      return parts.length === 1;
    });

    return directChildren.map(this.formatItem);
  }

  // ─── Staff: Criar pasta ─────────────────────────────────────────────────────

  async createFolder(teamId: string, userId: string, dto: CreateFolderDto) {
    await this.ensureTeamMember(teamId, userId);

    const parentPath = this.normalizePath(dto.path || '/');
    const fullPath = parentPath === '/' ? `/${dto.name}` : `${parentPath}/${dto.name}`;

    // Verificar se já existe
    const existing = await this.prisma.driveItem.findUnique({
      where: { teamId_path: { teamId, path: fullPath } },
    });

    if (existing) throw new ConflictException('Já existe uma pasta com esse nome neste local');

    // Verificar se o pai existe (se não for raiz)
    if (parentPath !== '/') {
      const parent = await this.prisma.driveItem.findFirst({
        where: { teamId, path: parentPath, isDirectory: true, isActive: true },
      });
      if (!parent) throw new NotFoundException('Pasta pai não encontrada');
    }

    const folder = await this.prisma.driveItem.create({
      data: {
        teamId,
        name: dto.name,
        path: fullPath,
        isDirectory: true,
        description: dto.description,
      },
    });

    return this.formatItem(folder);
  }

  // ─── Staff: Upload de arquivo ───────────────────────────────────────────────

  async uploadFile(teamId: string, userId: string, dto: CreateFileDto, file: Express.Multer.File) {
    await this.ensureTeamMember(teamId, userId);

    if (!file) throw new BadRequestException('Arquivo é obrigatório');

    const parentPath = this.normalizePath(dto.path || '/');
    const fileName = dto.name || file.originalname;
    const fullPath = parentPath === '/' ? `/${fileName}` : `${parentPath}/${fileName}`;

    // Verificar se já existe
    const existing = await this.prisma.driveItem.findUnique({
      where: { teamId_path: { teamId, path: fullPath } },
    });

    if (existing) throw new ConflictException('Já existe um arquivo com esse nome neste local');

    // Verificar se o pai existe (se não for raiz)
    if (parentPath !== '/') {
      const parent = await this.prisma.driveItem.findFirst({
        where: { teamId, path: parentPath, isDirectory: true, isActive: true },
      });
      if (!parent) throw new NotFoundException('Pasta não encontrada');
    }

    const fileUrl = await this.storage.upload(file, `teams/${teamId}/drive`);

    const driveItem = await this.prisma.driveItem.create({
      data: {
        teamId,
        name: fileName,
        path: fullPath,
        isDirectory: false,
        fileUrl,
        mimeType: file.mimetype,
        size: file.size,
        description: dto.description,
        competenceMonth: dto.competenceMonth,
        competenceYear: dto.competenceYear,
      },
    });

    return this.formatItem(driveItem);
  }

  // ─── Staff: Atualizar item (renomear/mover) ─────────────────────────────────

  async updateItem(teamId: string, itemId: string, userId: string, dto: UpdateItemDto) {
    await this.ensureTeamMember(teamId, userId);

    const item = await this.prisma.driveItem.findFirst({
      where: { id: itemId, teamId, isActive: true },
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    let newPath = item.path;

    // Se mudou o nome ou caminho, calcular novo path
    if (dto.name || dto.path) {
      const currentParts = item.path.split('/');
      const currentName = currentParts.pop();
      const currentParent = currentParts.join('/') || '/';

      const newName = dto.name || currentName;
      const newParent = dto.path ? this.normalizePath(dto.path) : currentParent;

      newPath = newParent === '/' ? `/${newName}` : `${newParent}/${newName}`;

      if (newPath !== item.path) {
        // Verificar se já existe no destino
        const existing = await this.prisma.driveItem.findUnique({
          where: { teamId_path: { teamId, path: newPath } },
        });

        if (existing) throw new ConflictException('Já existe um item com esse nome no destino');

        // Se for pasta, atualizar todos os filhos também
        if (item.isDirectory) {
          await this.prisma.driveItem.updateMany({
            where: {
              teamId,
              path: { startsWith: item.path + '/' },
              isActive: true,
            },
            data: {
              path: { set: undefined }, // Prisma não suporta replace, vamos fazer em batch
            },
          });

          // Buscar e atualizar cada filho
          const children = await this.prisma.driveItem.findMany({
            where: { teamId, path: { startsWith: item.path + '/' }, isActive: true },
          });

          for (const child of children) {
            const childNewPath = child.path.replace(item.path, newPath);
            await this.prisma.driveItem.update({
              where: { id: child.id },
              data: { path: childNewPath },
            });
          }
        }
      }
    }

    const updated = await this.prisma.driveItem.update({
      where: { id: itemId },
      data: {
        name: dto.name,
        path: newPath,
        description: dto.description,
        competenceMonth: dto.competenceMonth,
        competenceYear: dto.competenceYear,
      },
    });

    return this.formatItem(updated);
  }

  // ─── Staff: Deletar item ────────────────────────────────────────────────────

  async deleteItem(teamId: string, itemId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const item = await this.prisma.driveItem.findFirst({
      where: { id: itemId, teamId, isActive: true },
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    // Se for pasta, deletar tudo dentro
    if (item.isDirectory) {
      const children = await this.prisma.driveItem.findMany({
        where: { teamId, path: { startsWith: item.path + '/' }, isActive: true },
      });

      // Deletar arquivos do storage
      for (const child of children) {
        if (!child.isDirectory && child.fileUrl) {
          await this.storage.delete(child.fileUrl).catch(() => null);
        }
      }

      // Soft delete dos filhos
      await this.prisma.driveItem.updateMany({
        where: { teamId, path: { startsWith: item.path + '/' } },
        data: { isActive: false },
      });
    } else if (item.fileUrl) {
      await this.storage.delete(item.fileUrl).catch(() => null);
    }

    // Soft delete do item
    return this.prisma.driveItem.update({
      where: { id: itemId },
      data: { isActive: false },
    });
  }

  // ─── Staff: Compartilhar com empresa ────────────────────────────────────────

  async shareItem(teamId: string, itemId: string, userId: string, dto: ShareItemDto) {
    await this.ensureTeamMember(teamId, userId);

    const item = await this.prisma.driveItem.findFirst({
      where: { id: itemId, teamId, isActive: true },
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    // Verificar se empresa pertence ao team
    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, teamId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    // Criar ou atualizar compartilhamento
    return this.prisma.driveItemShare.upsert({
      where: { driveItemId_companyId: { driveItemId: itemId, companyId: dto.companyId } },
      create: {
        driveItemId: itemId,
        companyId: dto.companyId,
        canUpload: dto.canUpload ?? false,
      },
      update: {
        canUpload: dto.canUpload ?? false,
      },
      include: { company: { select: { id: true, name: true } } },
    });
  }

  async removeShare(teamId: string, itemId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const item = await this.prisma.driveItem.findFirst({
      where: { id: itemId, teamId, isActive: true },
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    const share = await this.prisma.driveItemShare.findUnique({
      where: { driveItemId_companyId: { driveItemId: itemId, companyId } },
    });

    if (!share) throw new NotFoundException('Compartilhamento não encontrado');

    return this.prisma.driveItemShare.delete({
      where: { id: share.id },
    });
  }

  async getShares(teamId: string, itemId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const item = await this.prisma.driveItem.findFirst({
      where: { id: itemId, teamId, isActive: true },
    });

    if (!item) throw new NotFoundException('Item não encontrado');

    return this.prisma.driveItemShare.findMany({
      where: { driveItemId: itemId },
      include: { company: { select: { id: true, name: true, cnpj: true } } },
    });
  }

  // ─── Staff: Listar itens compartilhados com uma empresa ──────────────────────

  async findSharedWithCompany(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    // Buscar todos os shares da empresa
    const shares = await this.prisma.driveItemShare.findMany({
      where: { companyId, driveItem: { teamId, isActive: true } },
      include: { driveItem: true },
    });

    if (shares.length === 0) return [];

    const sharedPaths = shares.map((s) => s.driveItem.path);

    // Buscar itens compartilhados e seus filhos
    const items = await this.prisma.driveItem.findMany({
      where: {
        teamId,
        isActive: true,
        OR: [
          { path: { in: sharedPaths } },
          ...sharedPaths.map((p) => ({ path: { startsWith: p + '/' } })),
        ],
      },
      orderBy: [{ isDirectory: 'desc' }, { name: 'asc' }],
    });

    return items.map(this.formatItem);
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

  // ─── Cliente: Listar itens compartilhados ───────────────────────────────────

  async findAllForClient(companyId: string, companyUserId: string) {
    await this.ensureCompanyUser(companyId, companyUserId);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { teamId: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    // Buscar todos os shares da empresa
    const shares = await this.prisma.driveItemShare.findMany({
      where: { companyId },
      include: { driveItem: true },
    });

    const sharedPaths = shares.map((s) => s.driveItem.path);

    // Buscar itens compartilhados e seus filhos
    const items = await this.prisma.driveItem.findMany({
      where: {
        teamId: company.teamId,
        isActive: true,
        OR: [
          { path: { in: sharedPaths } },
          ...sharedPaths.map((p) => ({ path: { startsWith: p + '/' } })),
        ],
      },
      orderBy: [{ isDirectory: 'desc' }, { name: 'asc' }],
    });

    // Retornar apenas as pastas raiz compartilhadas (não os filhos diretos na raiz)
    return items
      .filter((item) => sharedPaths.some((sp) => item.path === sp || item.path.startsWith(sp + '/')))
      .map(this.formatItem);
  }

  async findByPathForClient(companyId: string, companyUserId: string, path: string) {
    await this.ensureCompanyUser(companyId, companyUserId);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { teamId: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    const normalizedPath = this.normalizePath(path);

    // Verificar se o path está compartilhado (ou algum ancestral)
    const isShared = await this.isPathSharedWithCompany(normalizedPath, companyId, company.teamId);
    if (!isShared) throw new ForbiddenException('Pasta não compartilhada');

    const items = await this.prisma.driveItem.findMany({
      where: {
        teamId: company.teamId,
        isActive: true,
        path: { startsWith: normalizedPath === '/' ? '/' : normalizedPath + '/' },
      },
      orderBy: [{ isDirectory: 'desc' }, { name: 'asc' }],
    });

    // Filtrar apenas itens do nível atual
    const directChildren = items.filter((item) => {
      const relativePath = normalizedPath === '/' ? item.path : item.path.replace(normalizedPath, '');
      const parts = relativePath.split('/').filter(Boolean);
      return parts.length === 1;
    });

    return directChildren.map(this.formatItem);
  }

  async uploadFileForClient(
    companyId: string,
    companyUserId: string,
    path: string,
    file: Express.Multer.File,
    name?: string,
  ) {
    await this.ensureCompanyUser(companyId, companyUserId);

    if (!file) throw new BadRequestException('Arquivo é obrigatório');

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { teamId: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    const normalizedPath = this.normalizePath(path);

    // Verificar se pode fazer upload nesse path
    const canUpload = await this.canClientUploadToPath(normalizedPath, companyId, company.teamId);
    if (!canUpload) throw new ForbiddenException('Você não tem permissão para enviar arquivos nesta pasta');

    const fileName = name || file.originalname;
    const fullPath = normalizedPath === '/' ? `/${fileName}` : `${normalizedPath}/${fileName}`;

    // Verificar se já existe
    const existing = await this.prisma.driveItem.findUnique({
      where: { teamId_path: { teamId: company.teamId, path: fullPath } },
    });

    if (existing) throw new ConflictException('Já existe um arquivo com esse nome neste local');

    const fileUrl = await this.storage.upload(file, `teams/${company.teamId}/drive`);

    const driveItem = await this.prisma.driveItem.create({
      data: {
        teamId: company.teamId,
        name: fileName,
        path: fullPath,
        isDirectory: false,
        fileUrl,
        mimeType: file.mimetype,
        size: file.size,
      },
    });

    return this.formatItem(driveItem);
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async isPathSharedWithCompany(path: string, companyId: string, teamId: string): Promise<boolean> {
    const pathParts = path.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of pathParts) {
      currentPath += '/' + part;
      const item = await this.prisma.driveItem.findUnique({
        where: { teamId_path: { teamId, path: currentPath } },
        include: { shares: { where: { companyId } } },
      });

      if (item && item.shares.length > 0) return true;
    }

    return false;
  }

  private async canClientUploadToPath(path: string, companyId: string, teamId: string): Promise<boolean> {
    const pathParts = path.split('/').filter(Boolean);
    let currentPath = '';

    for (const part of pathParts) {
      currentPath += '/' + part;
      const item = await this.prisma.driveItem.findUnique({
        where: { teamId_path: { teamId, path: currentPath } },
        include: { shares: { where: { companyId } } },
      });

      if (item && item.shares.some((s) => s.canUpload)) return true;
    }

    return false;
  }

  private normalizePath(path: string): string {
    if (!path || path === '/') return '/';
    // Remover barras duplicadas e barra final
    return '/' + path.split('/').filter(Boolean).join('/');
  }

  private formatItem(item: any) {
    return {
      id: item.id,
      name: item.name,
      isDirectory: item.isDirectory,
      path: item.path,
      updatedAt: item.updatedAt.toISOString(),
      size: item.size,
      mimeType: item.mimeType,
      fileUrl: item.fileUrl,
      description: item.description,
      competenceMonth: item.competenceMonth,
      competenceYear: item.competenceYear,
    };
  }

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
  }

  private async ensureCompanyUser(companyId: string, companyUserId: string) {
    const companyUser = await this.prisma.companyUser.findFirst({
      where: { id: companyUserId, companyId, isActive: true },
    });

    if (!companyUser) throw new ForbiddenException('Acesso negado');
  }
}
