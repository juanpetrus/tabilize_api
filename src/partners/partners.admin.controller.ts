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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard.js';
import { PartnersService } from './partners.service.js';
import { ListPartnersDto } from './dto/list-partners.dto.js';
import { UpdatePartnerDto } from './dto/update-partner.dto.js';
import { RejectPartnerDto } from './dto/reject-partner.dto.js';
import { UpsertMaterialDto } from './dto/upsert-material.dto.js';

interface AdminRequest {
  user: { id: string; email: string; isSuperAdmin: boolean };
}

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin')
export class PartnersAdminController {
  constructor(private readonly partnersService: PartnersService) {}

  @Get('partners')
  list(@Query() query: ListPartnersDto) {
    return this.partnersService.listAdmin(query);
  }

  @Get('partners/:id')
  find(@Param('id') id: string) {
    return this.partnersService.findAdmin(id);
  }

  @Post('partners/:id/approve')
  approve(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.partnersService.approve(id, req.user.id);
  }

  @Post('partners/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectPartnerDto) {
    return this.partnersService.reject(id, dto);
  }

  @Post('partners/:id/suspend')
  suspend(@Param('id') id: string) {
    return this.partnersService.suspend(id);
  }

  @Patch('partners/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePartnerDto) {
    return this.partnersService.updateAdmin(id, dto);
  }

  // ── Materiais ──────────────────────────────────────────────────────────

  @Get('partner-materials')
  listMaterials() {
    return this.partnersService.listMaterialsAdmin();
  }

  @Post('partner-materials')
  createMaterial(@Body() dto: UpsertMaterialDto) {
    return this.partnersService.createMaterial(dto);
  }

  @Patch('partner-materials/:id')
  updateMaterial(@Param('id') id: string, @Body() dto: UpsertMaterialDto) {
    return this.partnersService.updateMaterial(id, dto);
  }

  @Delete('partner-materials/:id')
  deleteMaterial(@Param('id') id: string) {
    return this.partnersService.deleteMaterial(id);
  }
}
