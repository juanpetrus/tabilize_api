import { Module } from '@nestjs/common';
import { LicensesService } from './licenses.service.js';
import {
  LicensesController,
  ClientLicensesController,
} from './licenses.controller.js';
import { DatabaseModule } from '../database/index.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [LicensesController, ClientLicensesController],
  providers: [LicensesService],
  exports: [LicensesService],
})
export class LicensesModule {}
