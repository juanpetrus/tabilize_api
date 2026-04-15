import { Body, Controller, Delete, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CertificatesService } from './certificates.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/certificate')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upsert(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body('password') password: string,
    @Body('expiresAt') expiresAt?: string,
  ) {
    return this.certificatesService.upsert(teamId, companyId, req.user.id, file, password, expiresAt);
  }

  @Get()
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.certificatesService.findOne(teamId, companyId, req.user.id);
  }

  @Get('validate')
  validate(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.certificatesService.validate(teamId, companyId, req.user.id);
  }

  @Delete()
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.certificatesService.remove(teamId, companyId, req.user.id);
  }
}
