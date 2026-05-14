import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database';
import { AuthModule } from './auth';
import { TeamsModule } from './teams/teams.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { ClientAuthModule } from './client-auth/client-auth.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { BoardsModule } from './boards/boards.module.js';
import { MailModule } from './mail/mail.module.js';
import { DriveModule } from './drive/drive.module.js';
import { CertificatesModule } from './certificates/certificates.module.js';
import { ServiceRequestsModule } from './service-requests/service-requests.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { BillingModule } from './billing/billing.module.js';
import { SubscriptionGuard } from './billing/subscription.guard.js';
import { SefazModule } from './sefaz/sefaz.module.js';
import { CndModule } from './cnd/cnd.module.js';
import { LicensesModule } from './licenses/licenses.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { CatalogsModule } from './catalogs/catalogs.module.js';
import { FiscalConfigModule } from './fiscal-config/fiscal-config.module.js';
import { CustomersModule } from './customers/customers.module.js';
import { ProductsModule } from './products/products.module.js';
import { NfeModule } from './nfe/nfe.module.js';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TeamsModule,
    CompaniesModule,
    ClientAuthModule,
    DriveModule,
    TasksModule,
    BoardsModule,
    MailModule,
    CertificatesModule,
    ServiceRequestsModule,
    PaymentsModule,
    BillingModule,
    SefazModule,
    CndModule,
    LicensesModule,
    EmployeesModule,
    CatalogsModule,
    FiscalConfigModule,
    CustomersModule,
    ProductsModule,
    NfeModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: SubscriptionGuard }],
})
export class AppModule {}
