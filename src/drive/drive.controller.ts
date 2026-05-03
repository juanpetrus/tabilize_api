import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DriveService } from './drive.service.js';
import { CreateFolderDto } from './dto/create-folder.dto.js';
import { CreateFileDto } from './dto/create-file.dto.js';
import { UpdateItemDto } from './dto/update-item.dto.js';
import { ShareItemDto } from './dto/share-item.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ClientJwtGuard } from '../client-auth/guards/client-jwt.guard.js';

interface AuthRequest {
  user: { id: string };
}

interface ClientAuthRequest {
  user: { id: string; companyId: string };
}

// ─── Staff Controller ─────────────────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/drive')
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  // Listar todos os itens
  @Get()
  findAll(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.driveService.findAll(teamId, req.user.id);
  }

  // Listar itens de uma pasta específica
  @Get('folder')
  findByPath(@Param('teamId') teamId: string, @Query('path') path: string, @Req() req: AuthRequest) {
    return this.driveService.findByPath(teamId, req.user.id, path || '/');
  }

  // Criar pasta
  @Post('folder')
  createFolder(@Param('teamId') teamId: string, @Req() req: AuthRequest, @Body() dto: CreateFolderDto) {
    return this.driveService.createFolder(teamId, req.user.id, dto);
  }

  // Upload de arquivo
  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateFileDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.driveService.uploadFile(teamId, req.user.id, dto, file);
  }

  // Atualizar item (renomear/mover)
  @Patch(':itemId')
  updateItem(
    @Param('teamId') teamId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateItemDto,
  ) {
    return this.driveService.updateItem(teamId, itemId, req.user.id, dto);
  }

  // Deletar item
  @Delete(':itemId')
  deleteItem(@Param('teamId') teamId: string, @Param('itemId') itemId: string, @Req() req: AuthRequest) {
    return this.driveService.deleteItem(teamId, itemId, req.user.id);
  }

  // Compartilhar item com empresa
  @Post(':itemId/share')
  shareItem(
    @Param('teamId') teamId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthRequest,
    @Body() dto: ShareItemDto,
  ) {
    return this.driveService.shareItem(teamId, itemId, req.user.id, dto);
  }

  // Remover compartilhamento
  @Delete(':itemId/share/:companyId')
  removeShare(
    @Param('teamId') teamId: string,
    @Param('itemId') itemId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.driveService.removeShare(teamId, itemId, companyId, req.user.id);
  }

  // Listar compartilhamentos do item
  @Get(':itemId/shares')
  getShares(@Param('teamId') teamId: string, @Param('itemId') itemId: string, @Req() req: AuthRequest) {
    return this.driveService.getShares(teamId, itemId, req.user.id);
  }
}

// ─── Company Drive Controller (itens compartilhados com empresa) ──────────────

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/drive')
export class CompanyDriveController {
  constructor(private readonly driveService: DriveService) {}

  // Listar itens compartilhados com a empresa
  @Get()
  findShared(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.driveService.findSharedWithCompany(teamId, companyId, req.user.id);
  }
}

// ─── Client Controller (Portal) ──────────────────────────────────────────────

@UseGuards(ClientJwtGuard)
@Controller('client/drive')
export class ClientDriveController {
  constructor(private readonly driveService: DriveService) {}

  // Listar itens compartilhados
  @Get()
  findAll(@Req() req: ClientAuthRequest) {
    return this.driveService.findAllForClient(req.user.companyId, req.user.id);
  }

  // Listar itens de uma pasta específica
  @Get('folder')
  findByPath(@Query('path') path: string, @Req() req: ClientAuthRequest) {
    return this.driveService.findByPathForClient(req.user.companyId, req.user.id, path || '/');
  }

  // Upload de arquivo (se permitido)
  @Post('file')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @Req() req: ClientAuthRequest,
    @Query('path') path: string,
    @Body() body: { name?: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.driveService.uploadFileForClient(req.user.companyId, req.user.id, path || '/', file, body.name);
  }
}
