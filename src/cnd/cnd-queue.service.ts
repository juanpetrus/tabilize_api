import {
  Injectable,
  Logger,
  Optional,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../database/index.js';
import { CndIntegrationService } from './cnd-integration.service.js';
import { CndType, CndSyncStatus, CndStatus } from '../../generated/prisma/enums.js';
import { CND_SYNC_QUEUE, CND_SYNC_JOB } from './cnd-queue.config.js';

/**
 * Orquestra a sincronização de CNDs de forma assíncrona.
 *
 * - Com Redis (produção): enfileira um job e retorna na hora. O front faz
 *   polling em /company/:companyId e lê `syncStatus` (QUEUED → PROCESSING →
 *   IDLE/FAILED) pra mostrar spinner/progresso.
 * - Sem Redis (dev local): roda inline (comportamento antigo), pra não exigir
 *   infra extra no desenvolvimento.
 */
@Injectable()
export class CndQueueService {
  private readonly logger = new Logger(CndQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: CndIntegrationService,
    @Optional()
    @InjectQueue(CND_SYNC_QUEUE)
    private readonly queue?: Queue,
  ) {}

  /** Tipos com consulta automática disponível. */
  private static readonly SUPPORTED: CndType[] = [
    CndType.FEDERAL,
    CndType.TRABALHISTA,
    CndType.FGTS,
  ];

  // ─── Enfileirar uma CND ─────────────────────────────────────────────────────

  async enqueue(
    teamId: string,
    companyId: string,
    userId: string,
    type: CndType,
  ) {
    const company = await this.assertAccess(teamId, companyId, userId);

    if (!CndQueueService.SUPPORTED.includes(type)) {
      throw new BadRequestException(
        `Consulta automática não disponível para ${type}. ` +
          'Suportados: FEDERAL (requer certificado), TRABALHISTA (CNDT) e FGTS (CRF).',
      );
    }

    await this.markQueued(companyId, type);

    if (this.queue) {
      // Dedupe é do próprio BullMQ: com jobId estável, ele ignora o add se já
      // existir um job ativo/aguardando com esse id (não duplica). Se o registro
      // ficou preso em QUEUED sem job (ex.: falha no add), este add recria o job
      // e destrava. OBS: BullMQ não aceita ':' em jobId customizado (reservado).
      await this.queue.add(
        CND_SYNC_JOB,
        { teamId, companyId, userId, type },
        {
          jobId: `${companyId}_${type}`,
          attempts: 1, // a consulta já tem retry interno (captcha 20x)
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
      return { queued: true, type, company: company.name };
    }

    // Fallback inline (dev sem Redis): processa agora.
    await this.runInline(teamId, companyId, userId, type);
    return { queued: false, type, company: company.name };
  }

  // ─── Enfileirar todas as CNDs disponíveis de uma empresa ────────────────────

  async enqueueAll(teamId: string, companyId: string, userId: string) {
    await this.assertAccess(teamId, companyId, userId);

    const hasCert = await this.integration.hasCertificateActive(companyId);
    const types = CndQueueService.SUPPORTED.filter(
      (t) => t !== CndType.FEDERAL || hasCert,
    );

    const results: {
      type: CndType;
      queued: boolean;
      message?: string;
    }[] = [];

    for (const type of types) {
      try {
        const r = await this.enqueue(teamId, companyId, userId, type);
        results.push({ type, queued: r.queued });
      } catch (err) {
        results.push({
          type,
          queued: false,
          message: err instanceof Error ? err.message : 'Erro desconhecido',
        });
      }
    }

    if (!hasCert) {
      results.unshift({
        type: CndType.FEDERAL,
        queued: false,
        message: 'Certificado digital não encontrado — consulta ignorada',
      });
    }

    return { results };
  }

  // ─── Usado pelo processor (worker) ──────────────────────────────────────────

  /** Marca PROCESSING quando o worker pega o job. */
  async markProcessing(companyId: string, type: CndType) {
    await this.prisma.cnd.updateMany({
      where: { companyId, type },
      data: { syncStatus: CndSyncStatus.PROCESSING, syncStartedAt: new Date() },
    });
  }

  /** Marca IDLE após sucesso (status/datas reais já foram gravados em syncCnd). */
  async markDone(companyId: string, type: CndType) {
    await this.prisma.cnd.updateMany({
      where: { companyId, type },
      data: { syncStatus: CndSyncStatus.IDLE },
    });
  }

  /** Marca FAILED quando o job falha de vez. */
  async markFailed(companyId: string, type: CndType, message: string) {
    await this.prisma.cnd.updateMany({
      where: { companyId, type },
      data: { syncStatus: CndSyncStatus.FAILED, lastError: message },
    });
  }

  // ─── Internos ───────────────────────────────────────────────────────────────

  /** Cria o registro (se não existir) e marca QUEUED. */
  private async markQueued(companyId: string, type: CndType) {
    await this.prisma.cnd.upsert({
      where: { companyId_type: { companyId, type } },
      create: {
        companyId,
        type,
        status: CndStatus.PENDING,
        syncStatus: CndSyncStatus.QUEUED,
        autoSync: true,
      },
      update: { syncStatus: CndSyncStatus.QUEUED },
    });
  }

  /** Caminho sem fila: executa a consulta agora, atualizando o syncStatus. */
  private async runInline(
    teamId: string,
    companyId: string,
    userId: string,
    type: CndType,
  ) {
    await this.markProcessing(companyId, type);
    try {
      await this.integration.syncCnd(teamId, companyId, userId, type);
      await this.markDone(companyId, type);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      this.logger.warn(`Sync inline falhou (${type}/${companyId}): ${msg}`);
      await this.markFailed(companyId, type, msg);
    }
  }

  /** Valida permissão e empresa; retorna a empresa. */
  private async assertAccess(
    teamId: string,
    companyId: string,
    userId: string,
  ) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member)
      throw new BadRequestException('Você não é membro dessa equipe');

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
      select: { id: true, name: true, cnpj: true },
    });
    if (!company) throw new BadRequestException('Empresa não encontrada');
    if (!company.cnpj)
      throw new BadRequestException('Empresa sem CNPJ cadastrado');

    return company;
  }
}
