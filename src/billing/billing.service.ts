import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../database/index.js';
import { MailService } from '../mail/mail.service.js';

const stripe = new Stripe(process.env['STRIPE_SECRET_KEY'] ?? '');

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  getPlans() {
    return this.prisma.plan.findMany({
      where: { isActive: true },
      select: { id: true, name: true, description: true, priceMonthly: true, priceYearly: true, features: true, url: true },
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
      billingCycle: team?.billingCycle,
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
      if (['active', 'trialing'].includes(existing.status)) {
        throw new BadRequestException('Equipe já possui assinatura ativa. Use o endpoint de upgrade.');
      }
      if (['incomplete', 'past_due'].includes(existing.status)) {
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
      trial_period_days: 14,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['pending_setup_intent'],
      metadata: { teamId, planId, period },
    });

    await this.prisma.team.update({
      where: { id: teamId },
      data: {
        subscriptionId: subscription.id,
        ...(!team?.customerId && { customerId }),
      },
    });

    const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent;
    const clientSecret = setupIntent?.client_secret ?? null;

    return {
      clientSecret,
      mode: 'setup',
      customerId,
      subscriptionId: subscription.id,
    };
  }

  async cancelSubscription(teamId: string, userId: string) {
    await this.ensureTeamOwner(teamId, userId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { subscriptionId: true },
    });

    if (!team?.subscriptionId) throw new BadRequestException('Nenhuma assinatura ativa encontrada');

    const subscription = await stripe.subscriptions.retrieve(team.subscriptionId);
    if (!['active', 'trialing'].includes(subscription.status)) {
      throw new BadRequestException('Assinatura não pode ser cancelada no estado atual');
    }

    await stripe.subscriptions.update(team.subscriptionId, {
      cancel_at_period_end: true,
    });

    return { message: 'Assinatura será cancelada ao fim do período atual' };
  }

  async reactivateSubscription(teamId: string, userId: string) {
    await this.ensureTeamOwner(teamId, userId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { subscriptionId: true, customerId: true },
    });

    if (!team?.subscriptionId) throw new BadRequestException('Nenhuma assinatura encontrada');

    const subscription = await stripe.subscriptions.retrieve(team.subscriptionId);

    // Cancelamento agendado — só remove o agendamento
    if (subscription.cancel_at_period_end) {
      await stripe.subscriptions.update(team.subscriptionId, {
        cancel_at_period_end: false,
      });

      return { message: 'Cancelamento revertido. Assinatura continua ativa.' };
    }

    throw new BadRequestException('Assinatura já foi cancelada. Realize um novo checkout para assinar novamente.');
  }

  async getInvoices(teamId: string, userId: string) {
    await this.ensureTeamOwner(teamId, userId);

    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { customerId: true },
    });

    if (!team?.customerId) return [];

    const invoices = await stripe.invoices.list({
      customer: team.customerId,
      limit: 24,
    });

    return invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount: inv.amount_paid,
      currency: inv.currency,
      pdfUrl: inv.invoice_pdf,
      hostedUrl: inv.hosted_invoice_url,
      periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
      periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
      createdAt: new Date(inv.created * 1000),
    }));
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

    if (event.type === 'customer.subscription.updated') {
      const subscription = event.data.object as Stripe.Subscription;
      const teamId = subscription.metadata?.['teamId'];
      const planId = subscription.metadata?.['planId'];

      if (!teamId) return { received: true };

      let status = 'INACTIVE';
      let expiry: Date | null = null;

      if (subscription.status === 'trialing') {
        status = 'TRIAL';
        expiry = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
        const owner = await this.getTeamOwner(teamId);
        if (owner && expiry) {
          this.mail.sendTrialCardSaved(owner.email, owner.name, expiry).catch(() => null);
        }
      } else if (subscription.status === 'active') {
        status = 'ACTIVE';
        const item = subscription.items.data[0];
        expiry = item ? new Date(item.current_period_end * 1000) : null;
      } else if (subscription.status === 'past_due') {
        status = 'OVERDUE';
      } else if (subscription.status === 'canceled') {
        status = 'INACTIVE';
      }

      await this.prisma.team.update({
        where: { id: teamId },
        data: {
          subscriptionStatus: status,
          ...(expiry ? { subscriptionExpiry: expiry } : {}),
          ...(planId && status === 'ACTIVE' ? { planId } : {}),
        },
      });
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const parent = invoice.parent as { subscription_details?: { subscription?: string; metadata?: Record<string, string> } } | null;
      const subscriptionId = parent?.subscription_details?.subscription ?? null;
      const teamId = parent?.subscription_details?.metadata?.['teamId'];
      const planId = parent?.subscription_details?.metadata?.['planId'];

      if (!teamId || !subscriptionId) return { received: true };

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      const item = sub.items.data[0];
      const expiry = item ? new Date(item.current_period_end * 1000) : null;

      await this.prisma.team.update({
        where: { id: teamId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionId,
          ...(expiry ? { subscriptionExpiry: expiry } : {}),
          ...(planId ? { planId } : {}),
        },
      });

      const owner = await this.getTeamOwner(teamId);
      if (owner && expiry) {
        this.mail.sendSubscriptionActive(owner.email, owner.name, expiry).catch(() => null);
      }
    }

    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object as Stripe.Invoice;
      const parent = invoice.parent as { subscription_details?: { metadata?: Record<string, string> } } | null;
      const teamId = parent?.subscription_details?.metadata?.['teamId'];

      if (!teamId) return { received: true };

      await this.prisma.team.update({
        where: { id: teamId },
        data: { subscriptionStatus: 'OVERDUE' },
      });

      const owner = await this.getTeamOwner(teamId);
      if (owner) {
        this.mail.sendPaymentFailed(owner.email, owner.name).catch(() => null);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as Stripe.Subscription;
      const teamId = subscription.metadata?.['teamId'];

      await this.prisma.team.updateMany({
        where: { subscriptionId: subscription.id },
        data: { subscriptionStatus: 'INACTIVE' },
      });

      if (teamId) {
        const item = subscription.items.data[0];
        const expiry = item?.current_period_end
          ? new Date(item.current_period_end * 1000)
          : new Date();
        const owner = await this.getTeamOwner(teamId);
        if (owner) {
          this.mail.sendSubscriptionCancelled(owner.email, owner.name, expiry).catch(() => null);
        }
      }
    }

    return { received: true };
  }

  private async getTeamOwner(teamId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      select: { owner: { select: { email: true, name: true } } },
    });
    return team?.owner ?? null;
  }

  private async ensureTeamOwner(teamId: string, userId: string) {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, ownerId: userId, isActive: true },
    });

    if (!team) throw new ForbiddenException('Apenas o dono do escritório pode gerenciar assinaturas');
  }
}
