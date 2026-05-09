import { Module } from '@nestjs/common';
import { CndService } from './cnd.service.js';
import { CndIntegrationService } from './cnd-integration.service.js';
import { CndController, ClientCndController } from './cnd.controller.js';
import { DatabaseModule } from '../database/index.js';
import { StorageModule } from '../storage/storage.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';

@Module({
  imports: [DatabaseModule, StorageModule, CertificatesModule],
  controllers: [CndController, ClientCndController],
  providers: [CndService, CndIntegrationService],
  exports: [CndService, CndIntegrationService],
})
export class CndModule {}
