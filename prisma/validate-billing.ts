import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toISOString().slice(0, 10) : '—';
}

async function main() {
  const now = new Date();
  console.log(`\n=== Validação de billing — ${now.toISOString()} ===\n`);

  const activeTeams = await prisma.team.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      subscriptionStatus: true,
      subscriptionExpiry: true,
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          status: true,
          plan: true,
          trialEndsAt: true,
          currentPeriodEnd: true,
          gracePeriodEndsAt: true,
          paySubscriptionId: true,
        },
      },
    },
  });

  const problems: string[] = [];

  console.log(
    'TEAM'.padEnd(22),
    'TeamStatus'.padEnd(11),
    'SubStatus'.padEnd(10),
    'trialEnds'.padEnd(11),
    'periodEnd'.padEnd(11),
    'FLAGS',
  );
  console.log('-'.repeat(90));

  for (const t of activeTeams) {
    const sub = t.subscriptions[0];
    const flags: string[] = [];

    if (!sub) {
      flags.push('SEM_SUBSCRIPTION(usa fallback Team)');
      problems.push(`${t.name}: sem Subscription (cutover incompleto)`);
    } else {
      // PROD-BREAKER 1: ACTIVE com período vencido → dunning suspende
      if (sub.status === 'ACTIVE' && sub.currentPeriodEnd < now) {
        flags.push('⛔ ACTIVE+periodoVencido→dunning_suspende');
        problems.push(
          `${t.name}: ACTIVE com currentPeriodEnd ${fmt(sub.currentPeriodEnd)} no passado → cron dunning marcaria PAST_DUE/SUSPENDED`,
        );
      }
      // PROD-BREAKER 2: TRIAL vencido → guard bloqueia (402)
      if (sub.status === 'TRIAL' && sub.trialEndsAt < now) {
        flags.push('⛔ TRIAL_vencido→guard_bloqueia');
        problems.push(
          `${t.name}: TRIAL com trialEndsAt ${fmt(sub.trialEndsAt)} no passado → guard retorna 402`,
        );
      }
      // Aviso: status divergente entre Team(espelho) e Subscription(verdade)
      const mirror: Record<string, string> = {
        ACTIVE: 'ACTIVE',
        TRIAL: 'TRIAL',
        PAST_DUE: 'OVERDUE',
        SUSPENDED: 'INACTIVE',
        CANCELLED: 'INACTIVE',
      };
      if (mirror[sub.status] !== t.subscriptionStatus) {
        flags.push(
          `⚠ divergente(Team=${t.subscriptionStatus} vs Sub=${sub.status})`,
        );
      }
    }

    console.log(
      (t.name ?? '').slice(0, 21).padEnd(22),
      (t.subscriptionStatus ?? '').padEnd(11),
      (sub?.status ?? '—').padEnd(10),
      fmt(sub?.trialEndsAt).padEnd(11),
      fmt(sub?.currentPeriodEnd).padEnd(11),
      flags.join(' ') || 'ok',
    );
  }

  // Resumo
  const dist: Record<string, number> = {};
  for (const t of activeTeams) {
    const s = t.subscriptions[0]?.status ?? 'SEM_SUB';
    dist[s] = (dist[s] ?? 0) + 1;
  }
  console.log('\n=== Distribuição (Subscription.status) ===');
  for (const [k, v] of Object.entries(dist)) console.log(`  ${k}: ${v}`);

  console.log('\n=== Problemas que afetariam usuários cadastrados ===');
  if (problems.length === 0) {
    console.log('  ✅ Nenhum. Nenhuma org existente seria travada indevidamente.');
  } else {
    problems.forEach((p) => console.log(`  • ${p}`));
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
