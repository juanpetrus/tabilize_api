import { Module } from '@nestjs/common';
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
