import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../database/index.js';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '');

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  getPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true, priceMonthly: true, priceYearly: true, features: true },
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
        plan: {
          select: { id: true, name: true, description: true, priceMonthly: true, priceYearly: true, features: true },
        },
      },
    });

    let stripeSubscription: {
      stripeStatus: string;
      currentPeriodStart: Date | null;
      currentPeriodEnd: Date | null;
      cancelAtPeriodEnd: boolean;
      cancelAt: Date | null;
    } | null = null;

    if (team?.subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(team.subscriptionId);
      const item = sub.items.data[0];
      stripeSubscription = {
        stripeStatus: sub.status,
        currentPeriodStart: item ? new Date(item.current_period_start * 1000) : null,
        currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        cancelAt: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
      };
    }

    return {
      subscriptionStatus: team?.subscriptionStatus ?? 'INACTIVE',
      subscriptionExpiry: team?.subscriptionExpiry ?? null,
      subscriptionId: team?.subscriptionId ?? null,
      current_plan: team?.plan ?? null,
      stripe: stripeSubscription,
    };
  }

  async createCheckout(
    teamId: string,
    userId: string,
    planId: string,
    period: 'monthly' | 'yearly',
    name: string,
    email: string,
  ) {
    await this.ensureTeamOwner(teamId, userId);

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const priceId = period === 'yearly' ? plan.idProductYearly : plan.idProductMonthly;
    if (!priceId) throw new BadRequestException('Preço não configurado para este plano');

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });

    if (team?.subscriptionId) {
      const existing = await stripe.subscriptions.retrieve(team.subscriptionId);
      if (existing.status === 'active') {
        throw new BadRequestException('Equipe já possui assinatura ativa. Use o endpoint de upgrade.');
      }
      if (existing.status === 'incomplete') {
        await stripe.subscriptions.cancel(team.subscriptionId);
      }
    }

    const customerId = team?.customerId ?? (await stripe.customers.create({
      name,
      email,
      metadata: { teamId },
    })).id;

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.confirmation_secret'],
      metadata: { teamId, planId, period },
    });

    await this.prisma.team.update({
      where: { id: teamId },
      data: {
        subscriptionId: subscription.id,
        ...(!team?.customerId && { customerId }),
      },
    });

    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const clientSecret = invoice.confirmation_secret?.client_secret ?? null;

    return {
      clientSecret,
      customerId,
      subscriptionId: subscription.id,
    };
  }

  async upgradeSubscription(teamId: string, userId: string, planId: string, period: 'monthly' | 'yearly') {
    await this.ensureTeamOwner(teamId, userId);

    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team?.subscriptionId) throw new BadRequestException('Nenhuma assinatura ativa encontrada');

    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plano não encontrado');

    const priceId = period === 'yearly' ? plan.idProductYearly : plan.idProductMonthly;
    if (!priceId) throw new BadRequestException('Preço não configurado para este plano');

    const existing = await stripe.subscriptions.retrieve(team.subscriptionId);
    if (existing.status !== 'active') throw new BadRequestException('Assinatura não está ativa');

    await stripe.subscriptions.update(team.subscriptionId, {
      items: [{ id: existing.items.data[0].id, price: priceId }],
      proration_behavior: 'create_prorations',
      metadata: { teamId, planId, period },
    });

    await this.prisma.team.update({
      where: { id: teamId },
      data: { planId },
    });

    return { message: 'Plano atualizado com sucesso' };
  }

  async handleWebhook(payload: Buffer, signature: string) {
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Webhook inválido');
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const parent = invoice.parent as { subscription_details?: { subscription?: string; metadata?: Record<string, string> } } | null;
      const subscriptionId = parent?.subscription_details?.subscription ?? null;
      const teamId = parent?.subscription_details?.metadata?.['teamId'];
      const planId = parent?.subscription_details?.metadata?.['planId'];

      if (!teamId || !subscriptionId) return { received: true };

      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      await this.prisma.team.update({
        where: { id: teamId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionId,
          subscriptionExpiry: expiry,
          ...(planId ? { planId } : {}),
        },
      });
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;

      await this.prisma.team.updateMany({
        where: { subscriptionId: subscription.id },
        data: { subscriptionStatus: 'INACTIVE' },
      });
    }

    return { received: true };
  }

  private async ensureTeamOwner(teamId: string, userId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, ownerId: userId, isActive: true },
    });

    if (!team) throw new ForbiddenException('Apenas o dono do escritório pode gerenciar assinaturas');
  }
}
