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
import {
  LicensesService,
  type LicenseCompanyFilter,
} from './licenses.service.js';
import { CreateLicenseDto } from './dto/create-license.dto.js';
import { UpdateLicenseDto } from './dto/update-license.dto.js';
import { RenewLicenseDto } from './dto/renew-license.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ClientJwtGuard } from '../client-auth/guards/client-jwt.guard.js';
import { StorageService } from '../storage/storage.service.js';
import { LicenseType, LicenseStatus } from '../../generated/prisma/enums.js';

interface AuthRequest {
  user: { id: string };
}

interface ClientAuthRequest {
  user: { companyUserId: string; companyId: string };
}

// ─── Rotas do Staff (Contador) ───────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/licenses')
export class LicensesController {
  constructor(
    private readonly licensesService: LicensesService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Tela de Legalização: lista todas as empresas cadastradas com um resumo das
   * licenças (contagem por status, vencendo, vencidas e "saúde" da legalização).
   * Ao clicar numa empresa, usar `GET /company/:companyId` para ver os alvarás/licenças.
   */
  @Get()
  listCompanies(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Query('search') search?: string,
    @Query('filter') filter?: LicenseCompanyFilter,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.licensesService.listCompanies(teamId, req.user.id, {
      search,
      filter,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  /**
   * Lista plana de todas as licenças do escritório (paginada, com filtros).
   * Útil para uma aba "tudo que está vencendo" sem agrupar por empresa.
   */
  @Get('all')
  findAllByTeam(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Query('companyId') companyId?: string,
    @Query('type') type?: LicenseType,
    @Query('status') status?: LicenseStatus,
    @Query('search') search?: string,
    @Query('expiring') expiring?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.licensesService.findAllByTeam(teamId, req.user.id, {
      companyId,
      type,
      status,
      search,
      expiring: expiring === 'true' || expiring === '1',
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  /** Licenças vencendo nos próximos N dias (default 30) */
  @Get('expiring')
  findExpiringSoon(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Query('days') days?: string,
  ) {
    return this.licensesService.findExpiringSoon(
      teamId,
      req.user.id,
      days ? parseInt(days, 10) : 30,
    );
  }

  /** Resumo de alertas de vencimento (badge no menu) */
  @Get('summary')
  getSummary(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.licensesService.getSummary(teamId, req.user.id);
  }

  /** Licenças atuais de uma empresa */
  @Get('company/:companyId')
  findAllByCompany(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.licensesService.findAllByCompany(
      teamId,
      companyId,
      req.user.id,
    );
  }

  /** Criar licença */
  @Post('company/:companyId')
  create(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateLicenseDto,
  ) {
    return this.licensesService.create(teamId, companyId, req.user.id, dto);
  }

  /** Detalhe de uma licença */
  @Get('company/:companyId/:licenseId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('licenseId') licenseId: string,
    @Req() req: AuthRequest,
  ) {
    return this.licensesService.findOne(
      teamId,
      companyId,
      licenseId,
      req.user.id,
    );
  }

  /** Histórico (cadeia de renovações) — da mais antiga para a mais recente */
  @Get('company/:companyId/:licenseId/history')
  getHistory(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('licenseId') licenseId: string,
    @Req() req: AuthRequest,
  ) {
    return this.licensesService.getHistory(
      teamId,
      companyId,
      licenseId,
      req.user.id,
    );
  }

  /** Atualizar licença */
  @Patch('company/:companyId/:licenseId')
  update(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('licenseId') licenseId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateLicenseDto,
  ) {
    return this.licensesService.update(
      teamId,
      companyId,
      licenseId,
      req.user.id,
      dto,
    );
  }

  /** Renovar licença (cria um novo registro vinculado ao anterior) */
  @Post('company/:companyId/:licenseId/renew')
  renew(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('licenseId') licenseId: string,
    @Req() req: AuthRequest,
    @Body() dto: RenewLicenseDto,
  ) {
    return this.licensesService.renew(
      teamId,
      companyId,
      licenseId,
      req.user.id,
      dto,
    );
  }

  /** Upload do arquivo da licença (PDF/imagem) */
  @Post('company/:companyId/:licenseId/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('licenseId') licenseId: string,
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const fileUrl = await this.storageService.upload(
      file,
      `licenses/${companyId}/${licenseId}`,
    );

    return this.licensesService.updateFile(
      teamId,
      companyId,
      licenseId,
      req.user.id,
      fileUrl,
      file.originalname,
      file.mimetype,
    );
  }

  /** Remover licença */
  @Delete('company/:companyId/:licenseId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('licenseId') licenseId: string,
    @Req() req: AuthRequest,
  ) {
    return this.licensesService.remove(
      teamId,
      companyId,
      licenseId,
      req.user.id,
    );
  }
}

// ─── Rotas do Portal Cliente ─────────────────────────────────────────────────

@UseGuards(ClientJwtGuard)
@Controller('client/licenses')
export class ClientLicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  /** Licenças atuais da empresa do cliente */
  @Get()
  findAll(@Req() req: ClientAuthRequest) {
    return this.licensesService.findAllForClient(
      req.user.companyId,
      req.user.companyUserId,
    );
  }

  /** URL de download do arquivo da licença */
  @Get(':licenseId/download')
  getDownloadUrl(
    @Param('licenseId') licenseId: string,
    @Req() req: ClientAuthRequest,
  ) {
    return this.licensesService.getDownloadUrl(
      req.user.companyId,
      licenseId,
      req.user.companyUserId,
    );
  }
}
