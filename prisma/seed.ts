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
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
