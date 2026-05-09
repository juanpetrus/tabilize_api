import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service.js';
import { PayslipPdfService } from './payslip-pdf.service.js';
import {
  EmployeesController,
  ClientEmployeesController,
} from './employees.controller.js';
import { DatabaseModule } from '../database/index.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [DatabaseModule, StorageModule],
  controllers: [EmployeesController, ClientEmployeesController],
  providers: [EmployeesService, PayslipPdfService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
