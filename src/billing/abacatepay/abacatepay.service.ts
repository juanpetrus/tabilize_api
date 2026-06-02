import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BillingCycle } from '../../../generated/prisma/enums.js';
import { PrismaService } from '../../database/index.js';
import { MailService } from '../../mail/mail.service.js';
import { AbacatepayClient } from './abacatepay.client.js';
import type { AbacateWebhookPayload } from './abacatepay.types.js';

@Injectable()
export class AbacatepayService {
  private readonly logger = new Logger(AbacatepayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly client: AbacatepayClient,
  ) {}

  /**
   * Cria o checkout de assinatura (cartão recorrente) e retorna a URL hospedada.
   * Pré-cria o customer no AbacatePay com o CPF/CNPJ do team (idempotente por taxId).
   */
  async createSubscriptionCheckout(
    teamId: string,
    userId: string,
    planId: string,
    period: 'monthly' | 'yearly',
  ) {
    await this.ensureTeamOwner(teamId, userId);

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const productId =
      period === 'yearly' ? plan.idProductYearly : plan.idProductMonthly;
    if (!productId) {
      throw new BadRequestException(
        'Produto não configurado para este plano/ciclo no AbacatePay',
      );
    }

    const customerId = await this.ensureCustomer(teamId);

    // externalId precisa ser único por checkout — se reutilizar (ex.: usar só
    // o teamId), o AbacatePay deduplica e devolve o bill_ antigo já expirado.
    // O teamId continua disponível no webhook via metadata.teamId.
    const externalId = `${teamId}:${Date.now()}`;

    const billing = await this.client.createSubscription({
      items: [{ id: productId, quantity: 1 }],
      customerId,
      externalId,
      methods: ['CARD'],
      completionUrl: this.buildUrl(
        '/dashboard/configuracoes/billing?status=ok',
      ),
      returnUrl: this.buildUrl('/dashboard/configuracoes/billing'),
      metadata: { teamId, planId, period },
    });

    // Team = espelho legado; Subscription = fonte-de-verdade do acesso.
    await this.prisma.team.update({
      where: { id: teamId },
      data: {
        subscriptionId: billing.id,
        planId,
        billingCycle:
          period === 'yearly' ? BillingCycle.YEAR : BillingCycle.MONTH,
      },
    });

    const current = await this.currentSubscription(teamId);
    if (current) {
      await this.prisma.subscription.update({
        where: { id: current.id },
        data: {
          plan: this.planEnumFromId(planId),
          payCustomerId: customerId,
          payCheckoutId: billing.id,
        },
      });
    }

    return { url: billing.url, subscriptionId: billing.id };
  }

  /**
   * Troca de plano (upgrade/downgrade) via POST /subscriptions/change-plan.
   * A mudança fica PENDING e entra em vigor no PRÓXIMO ciclo — o ciclo atual
   * não é cobrado de novo. Requer assinatura ativa (`subs_...`).
   *
   * Se o team ainda não tem `subs_` (nunca pagou — está com `bill_` pendente),
   * faz fallback: cancela o bill antigo e cria um novo checkout do plano novo.
   */
  async changePlan(
    teamId: string,
    userId: string,
    planId: string,
    period: 'monthly' | 'yearly',
  ) {
    await this.ensureTeamOwner(teamId, userId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { subscriptionId: true, subscriptionStatus: true },
    });

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    // Downgrade: o plano-alvo precisa comportar o uso atual. Se tem limite de
    // empresas (maxCompanies != null) e o team já passou disso, bloqueia.
    if (plan.maxCompanies != null) {
      const companies = await this.prisma.company.count({ where: { teamId } });
      if (companies > plan.maxCompanies) {
        throw new BadRequestException({
          code: 'PLAN_DOWNGRADE_INCOMPATIBLE',
          message: `Seu escritório tem ${companies} empresas, acima do limite de ${plan.maxCompanies} do plano ${plan.name}. Remova empresas ou escolha um plano maior.`,
        });
      }
    }

    const productId =
      period === 'yearly' ? plan.idProductYearly : plan.idProductMonthly;
    if (!productId) {
      throw new BadRequestException(
        'Produto não configurado para este plano/ciclo no AbacatePay',
      );
    }

    // Fallback: team sem assinatura recorrente ainda (só tem bill_ ou nada).
    // /subscriptions/change-plan exige id "subs_" — então recai pro fluxo
    // cancel + create novo checkout.
    const hasActiveSubscription =
      team?.subscriptionId?.startsWith('subs_') ?? false;

    if (!hasActiveSubscription) {
      if (team?.subscriptionId) {
        await this.client
          .cancelSubscription(team.subscriptionId)
          .catch((err) => {
            this.logger.warn(
              `changePlan: falha ao cancelar checkout antigo ${team.subscriptionId}: ${
                (err as Error)?.message ?? String(err)
              }`,
            );
          });
      }
      return this.createSubscriptionCheckout(teamId, userId, planId, period);
    }

    // Caminho feliz: assinatura ativa (`subs_...`) → API change-plan oficial.
    const update = await this.client.changePlan({
      id: team!.subscriptionId!,
      productId,
      quantity: 1,
    });

    // A mudança só entra em vigor no próximo ciclo. Atualizamos planId/ciclo
    // localmente já — o `subscription.renewed` confirmará no próximo período.
    await this.prisma.team.update({
      where: { id: teamId },
      data: {
        planId,
        billingCycle:
          period === 'yearly' ? BillingCycle.YEAR : BillingCycle.MONTH,
      },
    });

    return {
      // `url` mantido p/ compat com o fluxo de checkout (frontend redireciona
      // pra essa URL). Aqui aponta pra própria página de billing — não há
      // pagamento a fazer agora, só sinaliza "troca agendada".
      url: this.buildUrl('/dashboard/configuracoes/billing?status=scheduled'),
      message: 'Troca de plano agendada para o próximo ciclo de cobrança.',
      updateId: update.id,
      subscriptionId: update.subscriptionId,
      status: update.status,
      newAmount: update.newAmount,
      requestedAt: update.requestedAt,
    };
  }

  /**
   * "Reativar" no AbacatePay = novo checkout do plano atual do team
   * (não há cancelamento agendado a desfazer; o cancel é definitivo).
   */
  async reactivate(teamId: string, userId: string) {
    await this.ensureTeamOwner(teamId, userId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { planId: true, billingCycle: true },
    });

    if (!team?.planId) {
      throw new BadRequestException(
        'Nenhum plano associado. Escolha um plano para assinar.',
      );
    }

    const period =
      team.billingCycle === BillingCycle.YEAR ? 'yearly' : 'monthly';
    return this.createSubscriptionCheckout(teamId, userId, team.planId, period);
  }

  /** Cancela a assinatura (imediato no AbacatePay) e marca o team como INACTIVE. */
  async cancelSubscription(teamId: string, userId: string) {
    await this.ensureTeamOwner(teamId, userId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        subscriptionId: true,
        owner: { select: { name: true, email: true } },
      },
    });
    if (!team?.subscriptionId) {
      throw new BadRequestException('Nenhuma assinatura ativa encontrada');
    }

    await this.client.cancelSubscription(team.subscriptionId);

    await this.prisma.team.update({
      where: { id: teamId },
      data: { subscriptionStatus: 'INACTIVE' },
    });
    const current = await this.currentSubscription(teamId);
    if (current) {
      await this.prisma.subscription.update({
        where: { id: current.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    }

    if (team.owner) {
      this.mail
        .sendSubscriptionCancelled(team.owner.email, team.owner.name, new Date())
        .catch(() => null);
    }

    return {
      message: 'Assinatura cancelada. O acesso é encerrado imediatamente.',
    };
  }

  /**
   * Garante um customer no AbacatePay para o team e devolve o `cust_...`.
   * Reusa name/email (User) + document (Team); persiste só o customerId.
   */
  private async ensureCustomer(teamId: string): Promise<string> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        customerId: true,
        document: true,
        phone: true,
        owner: { select: { name: true, email: true } },
      },
    });

    if (!team) throw new NotFoundException('Escritório não encontrado');
    if (team.customerId) return team.customerId;

    if (!team.document) {
      throw new BadRequestException(
        'CPF/CNPJ não informado. Atualize o cadastro antes de assinar.',
      );
    }

    const customer = await this.client.createCustomer({
      name: team.owner?.name,
      email: team.owner?.email ?? '',
      taxId: team.document,
      cellphone: team.phone ? team.phone : undefined,
    });

    await this.prisma.team.update({
      where: { id: teamId },
      data: { customerId: customer.id },
    });

    return customer.id;
  }

  /**
   * Processa eventos de webhook do AbacatePay.
   * O shape de `data` ainda não foi confirmado contra evento real — extração
   * defensiva por externalId (=teamId) ou pelo subscriptionId armazenado.
   */
  async processWebhook(payload: AbacateWebhookPayload) {
    const event = payload.event ?? payload.type ?? payload.name ?? '';
    const { teamId, subsId, checkoutId } = this.extractRefs(payload);
    const team = await this.findTeam(teamId, subsId ?? checkoutId);

    if (!team) {
      this.logger.warn(
        `Webhook "${event}" sem team correspondente — ignorado.`,
      );
      return { received: true };
    }

    switch (event) {
      case 'subscription.completed':
      case 'subscription.renewed': {
        const expiry = this.nextExpiry(team.billingCycle);
        // Promove team.subscriptionId para o subs_ definitivo na primeira vez
        // que ele aparece. Nunca regride: se já temos subs_, ignoramos bill_.
        const shouldPromoteSubsId = !!subsId && team.subscriptionId !== subsId;

        await this.prisma.team.update({
          where: { id: team.id },
          data: {
            subscriptionStatus: 'ACTIVE',
            subscriptionExpiry: expiry,
            ...(shouldPromoteSubsId ? { subscriptionId: subsId } : {}),
          },
        });
        // Fonte-de-verdade: promove a Subscription para ACTIVE e estende o ciclo.
        // Renovação bem-sucedida limpa qualquer grace/inadimplência anterior.
        const activeSub = await this.currentSubscription(team.id);
        if (activeSub) {
          await this.prisma.subscription.update({
            where: { id: activeSub.id },
            data: {
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
              currentPeriodEnd: expiry,
              gracePeriodEndsAt: null,
              ...(subsId ? { paySubscriptionId: subsId } : {}),
            },
          });
          await this.recordPaidInvoice(
            activeSub.id,
            team.id,
            event === 'subscription.completed' ? 'INITIAL' : 'RECURRING',
            expiry,
            checkoutId ?? subsId ?? activeSub.id,
          );
        }
        if (team.owner) {
          this.mail
            .sendSubscriptionActive(team.owner.email, team.owner.name, expiry)
            .catch(() => null);
        }
        break;
      }
      case 'subscription.trial_started': {
        await this.prisma.team.update({
          where: { id: team.id },
          data: { subscriptionStatus: 'TRIAL' },
        });
        const trialSub = await this.currentSubscription(team.id);
        if (trialSub) {
          await this.prisma.subscription.update({
            where: { id: trialSub.id },
            data: { status: 'TRIAL' },
          });
        }
        break;
      }
      case 'subscription.plan_changed': {
        // Troca de plano confirmada pelo AbacatePay. Vem PENDING — só entra em
        // vigor no PRÓXIMO ciclo (sem cobrança agora). Aqui apenas:
        //  • promovemos o subs_ definitivo (necessário p/ futuros change-plan), e
        //  • sincronizamos o plano-alvo pelo productId (cobre também troca feita
        //    direto no painel do Abacate, fora do nosso fluxo).
        // NÃO mexemos em status nem criamos Invoice (nada foi cobrado).
        const productId = (payload.data?.['productId'] as string | undefined) ?? undefined;
        const targetPlan = productId
          ? await this.prisma.plan.findFirst({
              where: {
                OR: [
                  { idProductMonthly: productId },
                  { idProductYearly: productId },
                ],
              },
              select: { id: true },
            })
          : null;

        await this.prisma.team.update({
          where: { id: team.id },
          data: {
            ...(subsId && team.subscriptionId !== subsId
              ? { subscriptionId: subsId }
              : {}),
            ...(targetPlan ? { planId: targetPlan.id } : {}),
          },
        });

        const changedSub = await this.currentSubscription(team.id);
        if (changedSub) {
          await this.prisma.subscription.update({
            where: { id: changedSub.id },
            data: {
              ...(subsId ? { paySubscriptionId: subsId } : {}),
              ...(targetPlan
                ? { plan: this.planEnumFromId(targetPlan.id) }
                : {}),
            },
          });
        }
        break;
      }
      case 'subscription.cancelled': {
        // Compara contra o id que o team tem hoje (subs_ se já promovido,
        // bill_ se ainda não houve completed). Cancel de assinatura já
        // substituída por troca de plano é ignorado.
        const cancelledId = subsId ?? checkoutId;
        if (
          cancelledId &&
          team.subscriptionId &&
          cancelledId !== team.subscriptionId
        ) {
          this.logger.log(
            `Cancelamento de assinatura substituída (${cancelledId}) — ignorado.`,
          );
          break;
        }
        await this.prisma.team.update({
          where: { id: team.id },
          data: { subscriptionStatus: 'INACTIVE' },
        });
        const cancelledSub = await this.currentSubscription(team.id);
        if (cancelledSub) {
          await this.prisma.subscription.update({
            where: { id: cancelledSub.id },
            data: { status: 'CANCELLED', cancelledAt: new Date() },
          });
        }
        if (team.owner) {
          this.mail
            .sendSubscriptionCancelled(
              team.owner.email,
              team.owner.name,
              new Date(),
            )
            .catch(() => null);
        }
        break;
      }
      default:
        this.logger.log(`Webhook "${event}" recebido sem handler — ignorado.`);
    }

    return { received: true };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Extrai teamId e ids do payload do webhook. Devolve `subsId` (subs_…) e
   * `checkoutId` (bill_…) separados — eles têm semânticas diferentes:
   *   • subs_  = assinatura recorrente (id estável, usado em change-plan/cancel)
   *   • bill_  = checkout (cobrança/link de pagamento, expira)
   *
   * teamId vem do metadata canônico; fallback faz split do externalId composto
   * (`${teamId}:${timestamp}`) ou usa o valor cru.
   */
  private extractRefs(payload: AbacateWebhookPayload): {
    teamId?: string;
    subsId?: string;
    checkoutId?: string;
  } {
    const data = payload.data ?? {};
    const checkout = data['checkout'] as Record<string, unknown> | undefined;
    const subscription = data['subscription'] as
      | Record<string, unknown>
      | undefined;
    const metadata = (checkout?.['metadata'] ?? data['metadata']) as
      | Record<string, string>
      | undefined;

    const rawExternalId =
      (checkout?.['externalId'] as string | undefined) ??
      (data['externalId'] as string | undefined);
    const teamId =
      metadata?.['teamId'] ?? rawExternalId?.split(':')[0] ?? rawExternalId;

    // Cada provider às vezes manda só um dos dois; tentamos pegar ambos quando
    // disponíveis. data.id é fallback bruto — só usado se nada mais vier.
    const rawId = data['id'] as string | undefined;
    const subsId =
      (subscription?.['id'] as string | undefined) ??
      (rawId?.startsWith('subs_') ? rawId : undefined);
    const checkoutId =
      (checkout?.['id'] as string | undefined) ??
      (rawId?.startsWith('bill_') ? rawId : undefined);

    return { teamId, subsId, checkoutId };
  }

  private async findTeam(teamId?: string, subscriptionId?: string) {
    const select = {
      id: true,
      billingCycle: true,
      subscriptionId: true,
      owner: { select: { name: true, email: true } },
    } as const;

    if (teamId) {
      const byId = await this.prisma.team.findUnique({
        where: { id: teamId },
        select,
      });
      if (byId) return byId;
    }

    if (subscriptionId) {
      return this.prisma.team.findFirst({
        where: { subscriptionId },
        select,
      });
    }

    return null;
  }

  /**
   * Subscription vigente do team = a mais recente. Troca de plano (cancel +
   * create) gera uma nova row, então "a última criada" é a corrente.
   */
  private currentSubscription(teamId: string) {
    return this.prisma.subscription.findFirst({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, paySubscriptionId: true },
    });
  }

  private planEnumFromId(
    planId: string | null | undefined,
  ): 'STARTER' | 'PRO' | 'ENTERPRISE' {
    if (planId === 'plan_pro') return 'PRO';
    if (planId === 'plan_scale') return 'ENTERPRISE';
    return 'STARTER';
  }

  /** Valor do ciclo vigente do team (Decimal BRL), derivado do Plan. */
  private async planAmount(teamId: string): Promise<number> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        billingCycle: true,
        plan: { select: { priceMonthly: true, priceYearly: true } },
      },
    });
    const cents =
      (team?.billingCycle === BillingCycle.YEAR
        ? team?.plan?.priceYearly
        : team?.plan?.priceMonthly) ?? 0;
    return cents / 100;
  }

  /**
   * Registra a Invoice de uma cobrança paga (conversão ou renovação).
   * Idempotente por JANELA DE TEMPO: reentregas do mesmo webhook chegam em
   * segundos; renovações reais distam ~1 mês. Evita invoice duplicada sem
   * depender de um event-id estável (que o AbacatePay não expõe de forma
   * confiável por ciclo).
   */
  private async recordPaidInvoice(
    subscriptionId: string,
    teamId: string,
    type: 'INITIAL' | 'RECURRING',
    expiry: Date,
    payChargeId: string,
  ) {
    const since = new Date(Date.now() - 23 * 3_600_000);
    const recent = await this.prisma.invoice.findFirst({
      where: { subscriptionId, createdAt: { gte: since } },
      select: { id: true },
    });
    if (recent) return;

    await this.prisma.invoice.create({
      data: {
        subscriptionId,
        teamId,
        amount: await this.planAmount(teamId),
        status: 'PAID',
        type,
        dueDate: expiry,
        paidAt: new Date(),
        payChargeId,
        attempt: 1,
      },
    });
  }

  private nextExpiry(cycle: BillingCycle): Date {
    const d = new Date();
    if (cycle === BillingCycle.YEAR) d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d;
  }

  private buildUrl(path: string): string {
    const base = process.env['FRONTEND_URL'] ?? 'https://tabilize.com.br';
    return `${base}${path}`;
  }

  private async ensureTeamOwner(teamId: string, userId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, ownerId: userId, isActive: true },
    });
    if (!team) {
      throw new ForbiddenException(
        'Apenas o dono do escritório pode gerenciar assinaturas',
      );
    }
  }
}
