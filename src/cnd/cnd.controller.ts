import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CndService } from './cnd.service.js';
import { CndIntegrationService } from './cnd-integration.service.js';
import { CreateCndDto } from './dto/create-cnd.dto.js';
import { UpdateCndDto } from './dto/update-cnd.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ClientJwtGuard } from '../client-auth/guards/client-jwt.guard.js';
import { StorageService } from '../storage/storage.service.js';
import { CndType } from '../../generated/prisma/enums.js';

interface AuthRequest {
  user: { id: string };
}

interface ClientAuthRequest {
  user: { companyUserId: string; companyId: string };
}

// ─── Rotas do Staff (Contador) ───────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/cnd')
export class CndController {
  constructor(
    private readonly cndService: CndService,
    private readonly cndIntegration: CndIntegrationService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Listar todas as CNDs do escritório
   */
  @Get()
  findAllByTeam(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.cndService.findAllByTeam(teamId, req.user.id);
  }

  /**
   * Listar CNDs próximas do vencimento
   */
  @Get('expiring')
  findExpiringSoon(
    @Param('teamId') teamId: string,
    @Query('days') days: string,
    @Req() req: AuthRequest,
  ) {
    return this.cndService.findExpiringSoon(
      teamId,
      req.user.id,
      days ? parseInt(days) : 30,
    );
  }

  /**
   * Resumo de alertas de vencimento (para badge no menu)
   */
  @Get('alerts')
  getAlertsSummary(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.cndService.getAlertsSummary(teamId, req.user.id);
  }

  /**
   * Listar CNDs de uma empresa específica
   */
  @Get('company/:companyId')
  findAllByCompany(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.cndService.findAllByCompany(teamId, companyId, req.user.id);
  }

  /**
   * Criar ou atualizar CND
   */
  @Post('company/:companyId')
  upsert(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateCndDto,
  ) {
    return this.cndService.upsert(teamId, companyId, req.user.id, dto);
  }

  /**
   * Buscar CND específica
   */
  @Get('company/:companyId/:cndId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('cndId') cndId: string,
    @Req() req: AuthRequest,
  ) {
    return this.cndService.findOne(teamId, companyId, cndId, req.user.id);
  }

  /**
   * Atualizar CND
   */
  @Patch('company/:companyId/:cndId')
  update(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('cndId') cndId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateCndDto,
  ) {
    return this.cndService.update(teamId, companyId, cndId, req.user.id, dto);
  }

  /**
   * Upload de PDF da certidão
   */
  @Post('company/:companyId/:cndId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('cndId') cndId: string,
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const fileUrl = await this.storageService.upload(
      file,
      `cnd/${companyId}/${cndId}`,
    );

    return this.cndService.updateFile(
      teamId,
      companyId,
      cndId,
      req.user.id,
      fileUrl,
      file.originalname,
    );
  }

  /**
   * Remover CND
   */
  @Delete('company/:companyId/:cndId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('cndId') cndId: string,
    @Req() req: AuthRequest,
  ) {
    return this.cndService.remove(teamId, companyId, cndId, req.user.id);
  }

  /**
   * Sincronizar uma CND específica via portal (CNDT ou CRF)
   */
  @Post('company/:companyId/sync/:type')
  syncCnd(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('type') type: CndType,
    @Req() req: AuthRequest,
  ) {
    return this.cndIntegration.syncCnd(teamId, companyId, req.user.id, type);
  }

  /**
   * Sincronizar todas as CNDs disponíveis (CNDT, CRF e Federal se tiver certificado)
   */
  @Post('company/:companyId/sync-all')
  syncAllCnds(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.cndIntegration.syncAllCnds(teamId, companyId, req.user.id);
  }

  /**
   * Verificar se empresa tem certificado ativo para consulta Federal
   */
  @Get('company/:companyId/has-certificate')
  async hasCertificate(@Param('companyId') companyId: string) {
    const hasCert = await this.cndIntegration.hasCertificateActive(companyId);
    return { hasCertificate: hasCert };
  }
}

// ─── Rotas do Portal Cliente ─────────────────────────────────────────────────

@UseGuards(ClientJwtGuard)
@Controller('client/cnd')
export class ClientCndController {
  constructor(private readonly cndService: CndService) {}

  /**
   * Listar CNDs da empresa do cliente
   */
  @Get()
  findAll(@Req() req: ClientAuthRequest) {
    return this.cndService.findAllForClient(
      req.user.companyId,
      req.user.companyUserId,
    );
  }

  /**
   * Obter URL de download da certidão
   */
  @Get(':cndId/download')
  getDownloadUrl(@Param('cndId') cndId: string, @Req() req: ClientAuthRequest) {
    return this.cndService.getDownloadUrl(
      req.user.companyId,
      cndId,
      req.user.companyUserId,
    );
  }
}
