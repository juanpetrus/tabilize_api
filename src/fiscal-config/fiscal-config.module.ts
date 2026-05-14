import { Module } from '@nestjs/common';
import { FiscalConfigService } from './fiscal-config.service.js';
import { FiscalConfigController } from './fiscal-config.controller.js';

@Module({
  controllers: [FiscalConfigController],
  providers: [FiscalConfigService],
  exports: [FiscalConfigService],
})
export class FiscalConfigModule {}
