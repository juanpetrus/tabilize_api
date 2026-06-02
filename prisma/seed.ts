import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // IDs de produto do AbacatePay (cycle MONTHLY/ANNUALLY já configurado lá).
  await prisma.plan.upsert({
    where: { id: 'plan_starter' },
    // campos no update p/ aplicar os valores a rows já existentes
    update: {
      maxCompanies: 20,
      capabilities: [],
      priceYearly: 99790,
      idProductMonthly: 'prod_rAgPXuwPr1F2feQTm5gXxJK0',
      idProductYearly: 'prod_43xu0kwwMkMGKYAUE4W4Sx1F',
    },
    create: {
      id: 'plan_starter',
      name: 'Starter',
      description: 'Para escritórios em início de operação',
      priceMonthly: 9700,
      priceYearly: 99790,
      features: ['Até 20 empresas', 'Tarefas ilimitadas', 'Documentos ilimitados', 'Suporte por e-mail'],
      maxCompanies: 20,
      capabilities: [],
      idProductMonthly: 'prod_rAgPXuwPr1F2feQTm5gXxJK0',
      idProductYearly: 'prod_43xu0kwwMkMGKYAUE4W4Sx1F',
    },
  });

  await prisma.plan.upsert({
    where: { id: 'plan_pro' },
    update: {
      maxCompanies: null,
      capabilities: ['csv_import'],
      priceYearly: 199790,
      idProductMonthly: 'prod_yHc6rdYTUuu6hgBE2XHwLdwS',
      idProductYearly: 'prod_ndPPZpSbw4ufuPfHNQkyN2KQ',
    },
    create: {
      id: 'plan_pro',
      name: 'Pro',
      description: 'Para escritórios em crescimento',
      priceMonthly: 19700,
      priceYearly: 199790,
      features: ['Empresas ilimitadas', 'Tarefas ilimitadas', 'Documentos ilimitados', 'Importação de planilha CSV', 'Suporte prioritário'],
      maxCompanies: null, // ilimitado
      capabilities: ['csv_import'],
      idProductMonthly: 'prod_yHc6rdYTUuu6hgBE2XHwLdwS',
      idProductYearly: 'prod_ndPPZpSbw4ufuPfHNQkyN2KQ',
    },
  });

  await prisma.plan.upsert({
    where: { id: 'plan_scale' },
    update: { maxCompanies: null, capabilities: ['csv_import'] },
    create: {
      id: 'plan_scale',
      name: 'Scale',
      description: 'Solução personalizada para grandes escritórios',
      features: ['Tudo do Pro', 'Volume personalizado', 'Integrações sob medida', 'Gerente de conta dedicado', 'SLA garantido'],
      maxCompanies: null, // ilimitado
      capabilities: ['csv_import'],
      url: 'https://wa.me/5569999222517',
    },
  });

  console.log('Planos criados com sucesso.');

  // ─── Backfill: Subscription (modelo SDD) p/ toda org ativa ─────────────────
  // Espelha o estado de billing legado de Team.subscription* numa row
  // Subscription, que passa a ser a fonte-de-verdade do acesso. Idempotente:
  // pula Teams que já têm Subscription.
  const PLAN_ENUM: Record<string, 'STARTER' | 'PRO' | 'ENTERPRISE'> = {
    plan_starter: 'STARTER',
    plan_pro: 'PRO',
    plan_scale: 'ENTERPRISE',
  };
  // Team.subscriptionStatus (String legado) → Subscription.status (enum SDD)
  const STATUS_ENUM: Record<
    string,
    'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED'
  > = {
    TRIAL: 'TRIAL',
    ACTIVE: 'ACTIVE',
    OVERDUE: 'PAST_DUE',
    INACTIVE: 'CANCELLED',
  };

  const teams = await prisma.team.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      planId: true,
      billingCycle: true,
      subscriptionStatus: true,
      subscriptionExpiry: true,
      customerId: true,
      subscriptionId: true,
    },
  });

  let created = 0;
  for (const team of teams) {
    const exists = await prisma.subscription.findFirst({
      where: { teamId: team.id },
      select: { id: true },
    });
    if (exists) continue;

    const plan = (team.planId && PLAN_ENUM[team.planId]) || 'STARTER';
    const status = STATUS_ENUM[team.subscriptionStatus] ?? 'TRIAL';

    const now = new Date();
    const trialEndsAt =
      team.subscriptionExpiry ?? new Date(now.getTime() + 14 * 86_400_000);
    const currentPeriodEnd = team.subscriptionExpiry ?? new Date(now);
    if (!team.subscriptionExpiry) {
      if (team.billingCycle === 'YEAR')
        currentPeriodEnd.setFullYear(now.getFullYear() + 1);
      else currentPeriodEnd.setMonth(now.getMonth() + 1);
    }

    const subscription = await prisma.subscription.create({
      data: {
        teamId: team.id,
        plan,
        status,
        trialEndsAt,
        currentPeriodStart: now,
        currentPeriodEnd,
        payCustomerId: team.customerId,
        paySubscriptionId: team.subscriptionId,
        cancelledAt: status === 'CANCELLED' ? now : null,
      },
    });

    // Orgs já pagantes/inadimplentes ganham uma Invoice espelho do ciclo vigente.
    if (status === 'ACTIVE' || status === 'PAST_DUE') {
      const planRow = team.planId
        ? await prisma.plan.findUnique({ where: { id: team.planId } })
        : null;
      const cents =
        (team.billingCycle === 'YEAR'
          ? planRow?.priceYearly
          : planRow?.priceMonthly) ?? 0;
      await prisma.invoice.create({
        data: {
          subscriptionId: subscription.id,
          teamId: team.id,
          amount: cents / 100,
          status: status === 'ACTIVE' ? 'PAID' : 'OVERDUE',
          type: 'INITIAL',
          dueDate: currentPeriodEnd,
          paidAt: status === 'ACTIVE' ? now : null,
          payChargeId: team.subscriptionId ?? 'backfill',
          attempt: 1,
        },
      });
    }
    created++;
  }
  console.log(`Backfill de Subscription: ${created} criada(s), ${teams.length - created} já existente(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
