import { Module } from '@nestjs/common';
import {
  ServiceRequestsController,
  TeamServiceRequestsController,
  ClientServiceRequestsController,
} from './service-requests.controller.js';
import { ServiceRequestsService } from './service-requests.service.js';
import { ClientAuthModule } from '../client-auth/client-auth.module.js';

@Module({
  imports: [ClientAuthModule],
  controllers: [
    ServiceRequestsController,
    TeamServiceRequestsController,
    ClientServiceRequestsController,
  ],
  providers: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
