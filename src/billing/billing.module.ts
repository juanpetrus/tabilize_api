import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { SubscriptionGuard } from './subscription.guard.js';

@Module({
  controllers: [BillingController],
  providers: [BillingService, SubscriptionGuard],
  exports: [SubscriptionGuard],
})
export class BillingModule {}
