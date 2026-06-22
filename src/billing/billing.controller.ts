import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BillingService } from './billing.service.js';
import { AbacatepayService } from './abacatepay/abacatepay.service.js';
import { AbacateCheckoutDto } from './dto/abacate-checkout.dto.js';
import type { AbacateWebhookPayload } from './abacatepay/abacatepay.types.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly abacate: AbacatepayService,
  ) {}

  @Get('plans')
  @ApiOperation({ summary: 'Lista os planos disponíveis' })
  @ApiResponse({ status: 200, description: 'Planos retornados.' })
  getPlans() {
    return this.billingService.getPlans();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('teams/:teamId/subscription')
  @ApiOperation({ summary: 'Retorna a assinatura atual do escritório' })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  @ApiResponse({ status: 200, description: 'Assinatura retornada.' })
  @ApiResponse({ status: 403, description: 'Usuário sem acesso ao team.' })
  getSubscription(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.billingService.getSubscription(teamId, req.user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('teams/:teamId/invoices')
  @ApiOperation({ summary: 'Histórico de faturas do escritório (paginado)' })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  getInvoices(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.billingService.getInvoices(
      teamId,
      req.user.id,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 20,
    );
  }

  // ─── AbacatePay (Pix-first BR) ────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('teams/:teamId/abacate/checkout')
  @ApiOperation({
    summary: 'Cria checkout via AbacatePay (Pix)',
    description:
      'Gera o link de cobrança Pix no AbacatePay para o plano informado.',
  })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  createAbacateCheckout(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: AbacateCheckoutDto,
  ) {
    return this.abacate.createSubscriptionCheckout(
      teamId,
      req.user.id,
      dto.planId,
      dto.period,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('teams/:teamId/abacate/subscription')
  @ApiOperation({
    summary: 'Troca de plano via AbacatePay (upgrade/downgrade)',
    description:
      'Usa POST /subscriptions/change-plan: a mudança fica PENDING e entra em vigor no próximo ciclo (sem proration, sem cobrar de novo no ciclo atual). Se o team ainda não tem assinatura ativa (só `bill_` pendente), cai no fallback cancel + novo checkout.',
  })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  changeAbacatePlan(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: AbacateCheckoutDto,
  ) {
    return this.abacate.changePlan(teamId, req.user.id, dto.planId, dto.period);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('teams/:teamId/abacate/subscription/reactivate')
  @ApiOperation({
    summary: 'Reassina via AbacatePay',
    description:
      'Gera um novo checkout do plano atual do team (o cancelamento no Abacate é definitivo).',
  })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  reactivateAbacateSubscription(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
  ) {
    return this.abacate.reactivate(teamId, req.user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('teams/:teamId/abacate/subscription')
  @ApiOperation({ summary: 'Cancela a assinatura AbacatePay' })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  cancelAbacateSubscription(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
  ) {
    return this.abacate.cancelSubscription(teamId, req.user.id);
  }

  /**
   * Webhook do AbacatePay. Duas camadas de verificação (ambas enviadas pelo
   * provider): (1) `?webhookSecret=` na query e (2) HMAC-SHA256 do corpo cru no
   * header `X-Webhook-Signature`. A camada HMAC só é exigida quando o header vem.
   */
  @Post('abacate/webhook')
  @ApiOperation({
    summary: 'Webhook do AbacatePay',
    description:
      'Endpoint chamado pelo AbacatePay. Verifica `webhookSecret` (query) + HMAC-SHA256 (header X-Webhook-Signature) sobre o corpo cru.',
  })
  abacateWebhook(
    @Query('webhookSecret') secret: string,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: AbacateWebhookPayload,
  ) {
    const expected = process.env['ABACATEPAY_WEBHOOK_SECRET'] ?? '';
    if (!expected) {
      throw new ForbiddenException('Webhook secret não configurado');
    }

    // Camada 1 — secret na query (sempre exigido).
    if (secret !== expected) {
      throw new ForbiddenException('Webhook secret inválido');
    }

    // Camada 2 — HMAC do corpo cru (quando o provider envia o header).
    if (signature && !this.verifyHmac(req.rawBody, signature, expected)) {
      throw new ForbiddenException('Assinatura HMAC inválida');
    }

    return this.abacate.processWebhook(payload);
  }

  /** HMAC-SHA256 do corpo cru vs. header, comparação timing-safe. */
  private verifyHmac(
    rawBody: Buffer | undefined,
    signature: string,
    secret: string,
  ): boolean {
    if (!rawBody) return false;
    const expected = createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const received = Buffer.from(signature.replace(/^sha256=/i, ''), 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');
    if (received.length !== expectedBuf.length || received.length === 0) {
      return false;
    }
    return timingSafeEqual(received, expectedBuf);
  }
}
