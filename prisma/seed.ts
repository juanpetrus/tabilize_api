import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.plan.upsert({
    where: { id: 'starter' },
    update: {},
    create: {
      id: 'starter',
      name: 'Starter',
      description: 'Para escritórios em início de operação',
      priceMonthly: 9700,
      priceYearly: 97000,
      features: ['Até 20 empresas', 'Tarefas ilimitadas', 'Documentos ilimitados', 'Suporte por e-mail'],
      stripePriceMonthly: process.env['STRIPE_PRICE_STARTER_MONTHLY'],
      stripePriceYearly: process.env['STRIPE_PRICE_STARTER_YEARLY'],
    },
  });

  await prisma.plan.upsert({
    where: { id: 'pro' },
    update: {},
    create: {
      id: 'pro',
      name: 'Pro',
      description: 'Para escritórios em crescimento',
      priceMonthly: 19700,
      priceYearly: 197000,
      features: ['Empresas ilimitadas', 'Tarefas ilimitadas', 'Documentos ilimitados', 'Importação de planilha CSV', 'Suporte prioritário'],
      stripePriceMonthly: process.env['STRIPE_PRICE_PRO_MONTHLY'],
      stripePriceYearly: process.env['STRIPE_PRICE_PRO_YEARLY'],
    },
  });

  console.log('Planos criados com sucesso.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
