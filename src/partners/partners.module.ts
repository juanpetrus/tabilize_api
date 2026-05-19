import { Module } from '@nestjs/common';
import { PartnerAuthModule } from '../partner-auth/index.js';
import { LandingPagesModule } from '../landing-pages/landing-pages.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { PartnersService } from './partners.service.js';
import { PartnersAdminController } from './partners.admin.controller.js';
import { PartnersPartnerController } from './partners.partner.controller.js';
import { PartnersPublicController } from './partners.public.controller.js';

@Module({
  imports: [PartnerAuthModule, LandingPagesModule, LeadsModule],
  controllers: [
    PartnersAdminController,
    PartnersPartnerController,
    PartnersPublicController,
  ],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
