import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CndIntegrationService } from './cnd-integration.service.js';
import { CndQueueService } from './cnd-queue.service.js';
import { CndType } from '../../generated/prisma/enums.js';
import { CND_SYNC_QUEUE, type CndSyncJobData } from './cnd-queue.config.js';

/**
 * Worker da fila de sync de CNDs.
 *
 * concurrency: 1 — a consulta é CPU-bound (Playwright + EasyOCR no OCR worker)
 * e a vCPU do Railway é limitada. Serializar evita que vários syncs simultâneos
 * briguem por CPU e estourem timeouts. Aumente com cautela só se o host tiver
 * folga de CPU/RAM.
 */
@Processor(CND_SYNC_QUEUE, { concurrency: 1 })
export class CndSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CndSyncProcessor.name);

  constructor(
    private readonly integration: CndIntegrationService,
    private readonly queueService: CndQueueService,
  ) {
    super();
  }

  async process(job: Job<CndSyncJobData>) {
    const { teamId, companyId, userId, type } = job.data;
    const cndType = type as CndType;

    this.logger.log(`Processando sync ${type} da empresa ${companyId}`);
    await this.queueService.markProcessing(companyId, cndType);

    try {
      const result = await this.integration.syncCnd(
        teamId,
        companyId,
        userId,
        cndType,
      );
      await this.queueService.markDone(companyId, cndType);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      this.logger.warn(`Sync ${type}/${companyId} falhou: ${msg}`);
      await this.queueService.markFailed(companyId, cndType, msg);
      throw err; // marca o job como failed no BullMQ
    }
  }
}
