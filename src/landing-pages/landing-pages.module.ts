import { Module } from '@nestjs/common';
import { LandingPagesService } from './landing-pages.service.js';
import { LandingPagesAdminController } from './landing-pages.admin.controller.js';

@Module({
  controllers: [LandingPagesAdminController],
  providers: [LandingPagesService],
  exports: [LandingPagesService],
})
export class LandingPagesModule {}
