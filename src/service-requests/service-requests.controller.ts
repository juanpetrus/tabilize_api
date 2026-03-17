import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ServiceRequestsService } from './service-requests.service.js';
import { CreateServiceRequestDto } from './dto/create-service-request.dto.js';
import { UpdateServiceRequestStatusDto } from './dto/update-service-request-status.dto.js';
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
@Controller('teams/:teamId/companies/:companyId/service-requests')
export class ServiceRequestsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @Get()
  findAll(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.serviceRequestsService.findAllForTeam(teamId, companyId, req.user.id);
  }

  @Patch(':requestId/status')
  updateStatus(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('requestId') requestId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateServiceRequestStatusDto,
  ) {
    return this.serviceRequestsService.updateStatus(teamId, companyId, requestId, req.user.id, dto);
  }
}

// Visão geral de pedidos do escritório
@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/service-requests')
export class TeamServiceRequestsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @Get()
  findAll(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.serviceRequestsService.findAllByTeam(teamId, req.user.id);
  }
}

// Rotas do portal cliente
@UseGuards(ClientJwtGuard)
@Controller('client/service-requests')
export class ClientServiceRequestsController {
  constructor(private readonly serviceRequestsService: ServiceRequestsService) {}

  @Post()
  create(@Req() req: ClientAuthRequest, @Body() dto: CreateServiceRequestDto) {
    return this.serviceRequestsService.create(req.user.id, req.user.companyId, dto);
  }

  @Get()
  findAll(@Req() req: ClientAuthRequest) {
    return this.serviceRequestsService.findAllForClient(req.user.id, req.user.companyId);
  }
}
