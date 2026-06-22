import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { SubscriptionGuard } from './subscription.guard.js';
import { AbacatepayClient } from './abacatepay/abacatepay.client.js';
import { AbacatepayService } from './abacatepay/abacatepay.service.js';
import { BillingCronService } from './billing-cron.service.js';

@Module({
  controllers: [BillingController],
  providers: [
    BillingService,
    SubscriptionGuard,
    AbacatepayClient,
    AbacatepayService,
    BillingCronService,
  ],
  exports: [SubscriptionGuard],
})
export class BillingModule {}
