import { Module } from '@nestjs/common';
import { CndService } from './cnd.service.js';
import { CndIntegrationService } from './cnd-integration.service.js';
import { OcrWorkerService } from './ocr-worker.service.js';
import { CndQueueService } from './cnd-queue.service.js';
import { CndSyncProcessor } from './cnd-sync.processor.js';
import { CndController, ClientCndController } from './cnd.controller.js';
import { DatabaseModule } from '../database/index.js';
import { StorageModule } from '../storage/storage.module.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { isQueueEnabled } from '../queue/queue.config.js';
import { CND_SYNC_QUEUE } from './cnd-queue.config.js';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    CertificatesModule,
    // Registra a fila 'cnd-sync' (e a adiciona ao dashboard global).
    ...QueueModule.registerQueue(CND_SYNC_QUEUE),
  ],
  controllers: [CndController, ClientCndController],
  providers: [
    CndService,
    CndIntegrationService,
    OcrWorkerService,
    CndQueueService,
    // O processor só sobe quando há Redis; sem ele, o sync roda inline.
    ...(isQueueEnabled() ? [CndSyncProcessor] : []),
  ],
  exports: [CndService, CndIntegrationService],
})
export class CndModule {}
