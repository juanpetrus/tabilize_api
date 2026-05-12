import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import {
  CertificatesService,
  type CertificateStatusFilter,
} from './certificates.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

/**
 * Endpoints da tela de gestão de certificados (visão por equipe).
 * As operações por empresa (upload/editar/validar/remover) ficam em
 * `CertificatesController` (`/teams/:teamId/companies/:companyId/certificate`).
 */
@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/certificates')
export class CertificatesOverviewController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get()
  list(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Query('search') search?: string,
    @Query('status') status?: CertificateStatusFilter,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.certificatesService.listForTeam(teamId, req.user.id, {
      search,
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }
}
