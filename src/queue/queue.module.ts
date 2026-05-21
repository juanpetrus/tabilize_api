import { Global, Module, DynamicModule } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import {
  isQueueEnabled,
  buildRedisConnection,
  buildDashboardAuth,
} from './queue.config.js';

/**
 * Infra de filas GLOBAL do projeto.
 *
 * - Conexão Redis compartilhada (BullModule.forRoot é global).
 * - Dashboard único (Bull Board) em /admin/queues, protegido por basic auth.
 *
 * Cada feature (CND, folha, nota fiscal…) cria a SUA fila com
 * `QueueModule.registerQueue('nome-da-fila')` no `imports` do seu módulo, e
 * implementa o próprio @Processor. A fila aparece automaticamente no dashboard.
 *
 * Sem REDIS_URL (dev local), tudo isto vira no-op e as features rodam inline.
 */
@Global()
@Module({})
export class QueueModule {
  /** Registrado uma vez no AppModule. */
  static forRoot(): DynamicModule {
    if (!isQueueEnabled()) {
      return { module: QueueModule };
    }

    return {
      module: QueueModule,
      imports: [
        BullModule.forRoot({ connection: buildRedisConnection() }),
        BullBoardModule.forRoot({
          route: '/admin/queues',
          adapter: ExpressAdapter,
          middleware: buildDashboardAuth(),
        }),
      ],
      exports: [BullModule],
    };
  }

  /**
   * Usado por cada feature no `imports` do seu módulo:
   *   imports: [...QueueModule.registerQueue(CND_SYNC_QUEUE)]
   *
   * Registra a fila no BullMQ e a adiciona ao dashboard. Sem Redis, devolve
   * lista vazia (a feature usa o fallback inline).
   */
  static registerQueue(name: string): DynamicModule[] {
    if (!isQueueEnabled()) return [];
    return [
      BullModule.registerQueue({ name }),
      BullBoardModule.forFeature({ name, adapter: BullMQAdapter }),
    ];
  }
}
