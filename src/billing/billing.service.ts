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
    const isOnTrial = team?.subscriptionStatus === 'TRIAL' &&
      team?.subscriptionExpiry != null &&
      team.subscriptionExpiry.getTime() > Date.now();

    const customer = await stripe.customers.create({
      name,
      email,
      metadata: { teamId },
    });

    const subscriptionParams: Stripe.SubscriptionCreateParams = {
      customer: customer.id,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: { teamId, planId, period },
    };

    if (isOnTrial && team?.subscriptionExpiry) {
      const daysLeft = Math.ceil((team.subscriptionExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0) subscriptionParams.trial_period_days = daysLeft;
    }

    const subscription = await stripe.subscriptions.create(subscriptionParams);

    // Trial ativo → SetupIntent para salvar cartão sem cobrar agora
    if (isOnTrial) {
      const setupIntent = await stripe.setupIntents.create({
        customer: customer.id,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: { subscriptionId: subscription.id, planId },
      });

      return {
        clientSecret: setupIntent.client_secret,
        customerId: customer.id,
        subscriptionId: subscription.id,
        mode: 'setup',
      };
    }

    // Sem trial → PaymentIntent para cobrar imediatamente
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    const paymentIntent = (invoice as unknown as { payment_intent: Stripe.PaymentIntent }).payment_intent;

    return {
      clientSecret: paymentIntent.client_secret,
      customerId: customer.id,
      subscriptionId: subscription.id,
      mode: 'payment',
    };
  }

  async handleWebhook(payload: Buffer, signature: string) {
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'] ?? '';

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Webhook inválido');
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const { teamId, planId } = session.metadata ?? {};
      if (!teamId) return { received: true };

      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      await this.prisma.team.update({
        where: { id: teamId },
        data: {
          subscriptionStatus: 'ACTIVE',
          subscriptionId: session.subscription as string,
          subscriptionExpiry: expiry,
          ...(planId ? { planId } : {}),
        },
      });
    }

    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;

      const team = await this.prisma.team.findFirst({ where: { subscriptionId } });
      if (!team) return { received: true };

      const expiry = new Date();
      expiry.setMonth(expiry.getMonth() + 1);

      await this.prisma.team.update({
        where: { id: team.id },
        data: { subscriptionStatus: 'ACTIVE', subscriptionExpiry: expiry },
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
