import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ClientJwtGuard } from '../client-auth/guards/client-jwt.guard.js';

interface AuthRequest {
  user: { id: string };
}

interface ClientAuthRequest {
  user: { id: string; companyId: string };
}

// Visão geral do escritório
@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/payments')
export class TeamPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.paymentsService.findAllByTeam(teamId, req.user.id);
  }
}

// Cobranças por empresa
@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  create(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(teamId, companyId, req.user.id, dto);
  }

  @Get()
  findAll(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.paymentsService.findAllByCompany(teamId, companyId, req.user.id);
  }

  @Patch(':paymentId/status')
  updateStatus(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('paymentId') paymentId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdatePaymentStatusDto,
  ) {
    return this.paymentsService.updateStatus(teamId, companyId, paymentId, req.user.id, dto);
  }

  @Delete(':paymentId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('paymentId') paymentId: string,
    @Req() req: AuthRequest,
  ) {
    return this.paymentsService.remove(teamId, companyId, paymentId, req.user.id);
  }
}

// Portal cliente
@UseGuards(ClientJwtGuard)
@Controller('client/payments')
export class ClientPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@Req() req: ClientAuthRequest) {
    return this.paymentsService.findAllForClient(req.user.companyId, req.user.id);
  }
}
