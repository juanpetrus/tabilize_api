import { Module } from '@nestjs/common';
import { PaymentsController, TeamPaymentsController, ClientPaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { ClientAuthModule } from '../client-auth/client-auth.module.js';

@Module({
  imports: [ClientAuthModule],
  controllers: [PaymentsController, TeamPaymentsController, ClientPaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
