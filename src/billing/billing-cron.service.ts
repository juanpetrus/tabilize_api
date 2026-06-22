import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression, SchedulerRegistry } from '@nestjs/schedule';
import { PrismaService } from '../database/index.js';
import { MailService } from '../mail/mail.service.js';

/**
 * Jobs agendados do billing (SDD §06).
 * A Subscription é a fonte-de-verdade; Team.subscription* é espelhado.
 */
@Injectable()
export class BillingCronService implements OnModuleInit {
  private readonly logger = new Logger(BillingCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  /** No boot, lista os crons registrados + próxima execução — prova que subiram. */
  onModuleInit() {
    const jobs = this.scheduler.getCronJobs();
    if (jobs.size === 0) {
      this.logger.warn(
        'Nenhum cron registrado — ScheduleModule.forRoot() está no AppModule?',
      );
      return;
    }
    for (const [name, job] of jobs) {
      let next = 'n/a';
      try {
        next = job.nextDate().toString();
      } catch {
        /* lib de cron sem nextDate disponível ainda */
      }
      this.logger.log(`Cron "${name}" registrado — próxima execução: ${next}`);
    }
  }

  /**
   * Diariamente às 00:00: expira trials vencidos.
   *   • com pagamento (paySubscriptionId) → ACTIVE
   *   • sem pagamento                     → SUSPENDED + e-mail
   *
   * Na prática, trials já pagos viram ACTIVE pelo webhook antes daqui — o
   * caminho ACTIVE é defensivo. O foco do job é suspender quem não converteu.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'expireTrials' })
  async expireTrials() {
    this.logger.log('Cron "expireTrials" disparou.');
    const now = new Date();
    const expired = await this.prisma.subscription.findMany({
      where: { status: 'TRIAL', trialEndsAt: { lte: now } },
      select: {
        id: true,
        teamId: true,
        paySubscriptionId: true,
        team: { select: { owner: { select: { email: true, name: true } } } },
      },
    });

    if (expired.length === 0) return;

    let activated = 0;
    let suspended = 0;

    for (const sub of expired) {
      const paid = !!sub.paySubscriptionId;

      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: paid ? 'ACTIVE' : 'SUSPENDED' },
      });
      // Espelho legado.
      await this.prisma.team.update({
        where: { id: sub.teamId },
        data: { subscriptionStatus: paid ? 'ACTIVE' : 'INACTIVE' },
      });

      if (paid) {
        activated++;
      } else {
        suspended++;
        const owner = sub.team?.owner;
        if (owner) {
          // TODO: template dedicado "trial expirado" — reusa o de cancelamento por ora.
          this.mail
            .sendSubscriptionCancelled(owner.email, owner.name, now)
            .catch(() => null);
        }
      }
    }

    this.logger.log(
      `Trials expirados processados: ${activated} ativado(s), ${suspended} suspenso(s).`,
    );
  }

  /** Dias de carência entre detectar a renovação ausente e suspender. */
  private static readonly GRACE_DAYS = 3;

  /**
   * Diariamente às 09:00: dunning por AUSÊNCIA de renovação.
   *
   * O AbacatePay não emite evento de falha de cobrança (não há
   * `charge.failed`/`payment_failed`). A única pista de inadimplência é a
   * renovação que NÃO chegou: assinatura ACTIVE cujo `currentPeriodEnd` já
   * passou e nenhum `subscription.renewed` a estendeu.
   *
   *   • ACTIVE vencida sem grace  → PAST_DUE + abre carência + notifica
   *   • PAST_DUE com grace vencido → SUSPENDED + notifica
   *
   * NÃO há "nova tentativa de cobrança" (D+7): a retentativa do cartão é
   * controlada pelo provider — quando ele conseguir, manda `subscription.renewed`
   * e o handler do webhook volta a Subscription para ACTIVE.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM, { name: 'dunning' })
  async dunning() {
    this.logger.log('Cron "dunning" disparou.');
    const now = new Date();

    // 1) Renovação ausente → PAST_DUE + carência.
    const missed = await this.prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        currentPeriodEnd: { lt: now },
        gracePeriodEndsAt: null,
      },
      select: {
        id: true,
        teamId: true,
        team: { select: { owner: { select: { email: true, name: true } } } },
      },
    });

    for (const sub of missed) {
      const graceEnd = new Date(
        now.getTime() + BillingCronService.GRACE_DAYS * 86_400_000,
      );
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'PAST_DUE', gracePeriodEndsAt: graceEnd },
      });
      await this.prisma.team.update({
        where: { id: sub.teamId },
        data: { subscriptionStatus: 'OVERDUE' },
      });
      const owner = sub.team?.owner;
      if (owner) {
        this.mail.sendPaymentFailed(owner.email, owner.name).catch(() => null);
      }
    }

    // 2) Carência vencida → SUSPENDED.
    const toSuspend = await this.prisma.subscription.findMany({
      where: { status: 'PAST_DUE', gracePeriodEndsAt: { lt: now } },
      select: {
        id: true,
        teamId: true,
        team: { select: { owner: { select: { email: true, name: true } } } },
      },
    });

    for (const sub of toSuspend) {
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'SUSPENDED' },
      });
      await this.prisma.team.update({
        where: { id: sub.teamId },
        data: { subscriptionStatus: 'INACTIVE' },
      });
      const owner = sub.team?.owner;
      if (owner) {
        this.mail
          .sendSubscriptionCancelled(owner.email, owner.name, now)
          .catch(() => null);
      }
    }

    if (missed.length || toSuspend.length) {
      this.logger.log(
        `Dunning: ${missed.length} marcada(s) PAST_DUE, ${toSuspend.length} suspensa(s).`,
      );
    }
  }
}
