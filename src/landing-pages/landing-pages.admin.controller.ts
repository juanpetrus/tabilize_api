import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { SuperAdminGuard } from '../auth/guards/super-admin.guard.js';
import { LandingPagesService } from './landing-pages.service.js';
import { CreateLandingPageDto } from './dto/create-landing-page.dto.js';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto.js';

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/landing-pages')
export class LandingPagesAdminController {
  constructor(private readonly service: LandingPagesService) {}

  @Get()
  list() {
    return this.service.listAdmin();
  }

  @Post()
  create(@Body() dto: CreateLandingPageDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateLandingPageDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
