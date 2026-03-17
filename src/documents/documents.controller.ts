import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service.js';
import { CreateDocumentDto } from './dto/create-document.dto.js';
import { UpdateDocumentDto } from './dto/update-document.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ClientJwtGuard } from '../client-auth/guards/client-jwt.guard.js';

interface AuthRequest {
  user: { id: string };
}

interface ClientAuthRequest {
  user: { id: string; companyId: string };
}

// Rotas internas (contador/equipe)
@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateDocumentDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.documentsService.create(teamId, companyId, req.user.id, dto, file);
  }

  @Get()
  findAll(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.documentsService.findAll(teamId, companyId, req.user.id);
  }

  @Get(':documentId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('documentId') documentId: string,
    @Req() req: AuthRequest,
  ) {
    return this.documentsService.findOne(teamId, companyId, documentId, req.user.id);
  }

  @Patch(':documentId')
  update(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('documentId') documentId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.update(teamId, companyId, documentId, req.user.id, dto);
  }

  @Delete(':documentId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('documentId') documentId: string,
    @Req() req: AuthRequest,
  ) {
    return this.documentsService.remove(teamId, companyId, documentId, req.user.id);
  }
}

// Rotas do portal cliente
@UseGuards(ClientJwtGuard)
@Controller('client/documents')
export class ClientDocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  findAll(@Req() req: ClientAuthRequest) {
    return this.documentsService.findAllForClient(req.user.companyId, req.user.id);
  }
}
