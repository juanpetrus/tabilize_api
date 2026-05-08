/**
 * Script de migração: Popula CompanyUserCompany com dados existentes
 *
 * Execute com: npx tsx prisma/migrations/migrate-company-user-companies.ts
 *
 * Este script deve ser executado APÓS a migração Prisma que cria a tabela CompanyUserCompany.
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Iniciando migração de CompanyUser -> CompanyUserCompany...');

  // Busca todos os CompanyUsers
  const companyUsers = await prisma.companyUser.findMany({
    select: {
      id: true,
      companyId: true,
    },
  });

  console.log(`Encontrados ${companyUsers.length} usuários do portal.`);

  let created = 0;
  let skipped = 0;

  for (const user of companyUsers) {
    // Verifica se já existe a associação
    const existing = await prisma.companyUserCompany.findUnique({
      where: {
        companyUserId_companyId: {
          companyUserId: user.id,
          companyId: user.companyId,
        },
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    // Cria a associação
    await prisma.companyUserCompany.create({
      data: {
        companyUserId: user.id,
        companyId: user.companyId,
        isDefault: true,
      },
    });

    // Atualiza activeCompanyId se não estiver definido
    await prisma.companyUser.update({
      where: { id: user.id },
      data: { activeCompanyId: user.companyId },
    });

    created++;
  }

  console.log(`Migração concluída!`);
  console.log(`- Criados: ${created}`);
  console.log(`- Já existentes (pulados): ${skipped}`);
}

main()
  .catch((e) => {
    console.error('Erro na migração:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
