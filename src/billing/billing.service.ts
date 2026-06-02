import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';

/**
 * Leitura de planos e da assinatura do team. Toda a cobrança (checkout,
 * troca de plano, cancelamento, webhooks) vive em `AbacatepayService`.
 */
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  getPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        priceMonthly: true,
        priceYearly: true,
        features: true,
        url: true,
      },
      orderBy: { priceMonthly: 'asc' },
    });
  }

  async getSubscription(teamId: string, userId: string) {
    await this.ensureTeamOwner(teamId, userId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: {
        planId: true,
        subscriptionStatus: true,
        subscriptionExpiry: true,
        subscriptionId: true,
        billingCycle: true,
        plan: {
          select: {
            id: true,
            name: true,
            description: true,
            priceMonthly: true,
            priceYearly: true,
            features: true,
          },
        },
        // Fonte-de-verdade: a Subscription vigente (a mais recente).
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            status: true,
            trialEndsAt: true,
            currentPeriodEnd: true,
            gracePeriodEndsAt: true,
            cancelledAt: true,
          },
        },
      },
    });

    const sub = team?.subscriptions?.[0] ?? null;

    return {
      // Subscription manda; Team.subscription* é fallback p/ orgs não migradas.
      subscriptionStatus: sub?.status ?? team?.subscriptionStatus ?? 'INACTIVE',
      subscriptionExpiry:
        sub?.currentPeriodEnd ?? team?.subscriptionExpiry ?? null,
      trialEndsAt: sub?.trialEndsAt ?? null,
      gracePeriodEndsAt: sub?.gracePeriodEndsAt ?? null,
      cancelledAt: sub?.cancelledAt ?? null,
      subscriptionId: team?.subscriptionId ?? null,
      billingCycle: team?.billingCycle,
      current_plan: team?.plan ?? null,
    };
  }

  /** Histórico de faturas (Invoice) do escritório, paginado. */
  async getInvoices(teamId: string, userId: string, page = 1, pageSize = 20) {
    await this.ensureTeamOwner(teamId, userId);

    const take = Math.min(Math.max(pageSize, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { teamId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          amount: true,
          status: true,
          type: true,
          dueDate: true,
          paidAt: true,
          createdAt: true,
        },
      }),
      this.prisma.invoice.count({ where: { teamId } }),
    ]);

    return {
      items: items.map((inv) => ({ ...inv, amount: Number(inv.amount) })),
      total,
      page: Math.max(page, 1),
      pageSize: take,
    };
  }

  private async ensureTeamOwner(teamId: string, userId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, ownerId: userId, isActive: true },
    });

    if (!team)
      throw new ForbiddenException(
        'Apenas o dono do escritório pode gerenciar assinaturas',
      );
  }
}
