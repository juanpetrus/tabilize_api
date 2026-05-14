import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FiscalConfigService } from './fiscal-config.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import {
  UpdateFiscalDataDto,
  UpdateFiscalAddressDto,
  UpdateNfeConfigDto,
} from './dto/index.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/fiscal-config')
export class FiscalConfigController {
  constructor(private readonly fiscalConfigService: FiscalConfigService) {}

  /**
   * Retorna toda a configuração fiscal da empresa (perfil, endereço, NF-e) + completeness
   */
  @Get()
  getAll(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.fiscalConfigService.getAll(teamId, companyId, req.user.id);
  }

  /**
   * Atualiza o perfil fiscal da empresa (CRT, CNAE, IE etc.)
   */
  @Patch('data')
  updateData(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateFiscalDataDto,
  ) {
    return this.fiscalConfigService.updateData(teamId, companyId, req.user.id, dto);
  }

  /**
   * Atualiza o endereço fiscal da empresa
   */
  @Patch('address')
  updateAddress(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateFiscalAddressDto,
  ) {
    return this.fiscalConfigService.updateAddress(teamId, companyId, req.user.id, dto);
  }

  /**
   * Atualiza a configuração de NF-e da empresa
   */
  @Patch('nfe')
  updateNfe(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateNfeConfigDto,
  ) {
    return this.fiscalConfigService.updateNfe(teamId, companyId, req.user.id, dto);
  }
}
