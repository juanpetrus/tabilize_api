import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import { LeadsAdminController } from './leads.admin.controller.js';
import { LeadsPublicController } from './leads.public.controller.js';

@Module({
  controllers: [LeadsAdminController, LeadsPublicController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}
