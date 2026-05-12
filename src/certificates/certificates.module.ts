import { Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller.js';
import { CertificatesOverviewController } from './certificates-overview.controller.js';
import { CertificatesService } from './certificates.service.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [StorageModule],
  controllers: [CertificatesController, CertificatesOverviewController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
