import { Body, Controller, Get, Headers, Param, Patch, Post, RawBodyRequest, Req, UseGuards } from '@nestjs/common';
import { BillingService } from './billing.service.js';
import { CreateCheckoutDto } from './dto/create-checkout.dto.js';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get('teams/:teamId/subscription')
  getSubscription(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.billingService.getSubscription(teamId, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('teams/:teamId/checkout')
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

  @UseGuards(JwtAuthGuard)
  @Patch('teams/:teamId/subscription')
  upgradeSubscription(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    return this.billingService.upgradeSubscription(teamId, req.user.id, dto.planId, dto.period);
  }

  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.rawBody!, signature);
  }
}
