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
import { LeadsService } from './leads.service.js';
import { CreateLeadManualDto } from './dto/create-lead-manual.dto.js';
import { UpdateLeadDto } from './dto/update-lead.dto.js';
import { ListLeadsDto } from './dto/list-leads.dto.js';
import { CreateActivityDto } from './dto/create-activity.dto.js';
import { ConvertLeadDto } from './dto/convert-lead.dto.js';

interface AdminRequest {
  user: { id: string; email: string; isSuperAdmin: boolean };
}

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('admin/leads')
export class LeadsAdminController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  list(@Query() query: ListLeadsDto) {
    return this.leadsService.list(query);
  }

  @Get(':id')
  find(@Param('id') id: string) {
    return this.leadsService.find(id);
  }

  @Post()
  create(@Body() dto: CreateLeadManualDto) {
    return this.leadsService.createManual(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @Req() req: AdminRequest,
  ) {
    return this.leadsService.update(id, dto, req.user.id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leadsService.remove(id);
  }

  @Post(':id/convert')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @Req() req: AdminRequest,
  ) {
    return this.leadsService.convertManual(id, dto, req.user.id);
  }

  // ── Activities ───────────────────────────────────────────────────────

  @Get(':id/activities')
  listActivities(@Param('id') id: string) {
    return this.leadsService.listActivities(id);
  }

  @Post(':id/activities')
  createActivity(
    @Param('id') id: string,
    @Body() dto: CreateActivityDto,
    @Req() req: AdminRequest,
  ) {
    return this.leadsService.createActivity(id, dto, req.user.id);
  }

  @Delete(':id/activities/:activityId')
  deleteActivity(
    @Param('id') id: string,
    @Param('activityId') activityId: string,
  ) {
    return this.leadsService.deleteActivity(id, activityId);
  }
}
