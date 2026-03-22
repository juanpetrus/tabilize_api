import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database';
import { AuthModule } from './auth';
import { TeamsModule } from './teams/teams.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { ClientAuthModule } from './client-auth/client-auth.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { ServiceRequestsModule } from './service-requests/service-requests.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { BillingModule } from './billing/billing.module.js';
import { SubscriptionGuard } from './billing/subscription.guard.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TeamsModule,
    CompaniesModule,
    ClientAuthModule,
    DocumentsModule,
    TasksModule,
    ServiceRequestsModule,
    PaymentsModule,
    BillingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: SubscriptionGuard },
  ],
})
export class AppModule {}
