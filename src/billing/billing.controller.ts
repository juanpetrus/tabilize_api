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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { BillingService } from './billing.service.js';
import { AbacatepayService } from './abacatepay/abacatepay.service.js';
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';
import { AbacateCheckoutDto } from './dto/abacate-checkout.dto.js';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto.js';
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
  @Post('teams/:teamId/checkout')
  @ApiOperation({
    summary: 'Cria sessão de checkout (Stripe)',
    description:
      'Gera a URL de checkout do Stripe para o plano/período informado.',
  })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  @ApiResponse({ status: 201, description: 'Sessão de checkout criada.' })
  createCheckout(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.billingService.createCheckout(
      teamId,
      req.user.id,
      dto.planId,
      dto.period,
      dto.name,
      dto.email,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('teams/:teamId/subscription/reactivate')
  @ApiOperation({ summary: 'Reativa uma assinatura cancelada' })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  reactivateSubscription(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
  ) {
    return this.billingService.reactivateSubscription(teamId, req.user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Delete('teams/:teamId/subscription')
  @ApiOperation({ summary: 'Cancela a assinatura do escritório' })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  cancelSubscription(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.billingService.cancelSubscription(teamId, req.user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('teams/:teamId/invoices')
  @ApiOperation({ summary: 'Lista as faturas do escritório' })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  getInvoices(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.billingService.getInvoices(teamId, req.user.id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Patch('teams/:teamId/subscription')
  @ApiOperation({ summary: 'Faz upgrade/downgrade do plano ou período' })
  @ApiParam({ name: 'teamId', description: 'ID do escritório (Team)' })
  upgradeSubscription(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    return this.billingService.upgradeSubscription(
      teamId,
      req.user.id,
      dto.planId,
      dto.period,
    );
  }

  @Post('webhook')
  @ApiOperation({
    summary: 'Webhook do Stripe',
    description:
      'Endpoint para eventos do Stripe. Valida assinatura via header `stripe-signature`. Body raw.',
  })
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.rawBody!, signature);
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
   * Webhook do AbacatePay. Verificação pelo secret na query (`?webhookSecret=`),
   * padrão do provider — o endpoint é cadastrado com o secret embutido na URL.
   */
  @Post('abacate/webhook')
  @ApiOperation({
    summary: 'Webhook do AbacatePay',
    description:
      'Endpoint chamado pelo AbacatePay. Autenticação via query string `webhookSecret`.',
  })
  abacateWebhook(
    @Query('webhookSecret') secret: string,
    @Body() payload: AbacateWebhookPayload,
  ) {
    const expected = process.env['ABACATEPAY_WEBHOOK_SECRET'] ?? '';
    if (!expected || secret !== expected) {
      throw new ForbiddenException('Webhook secret inválido');
    }
    return this.abacate.processWebhook(payload);
  }
}
