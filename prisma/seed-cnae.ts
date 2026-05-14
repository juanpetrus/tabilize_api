import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface IbgeSubclasse {
  id: string;
  descricao: string;
  classe: {
    id: string;
    descricao: string;
    grupo: {
      id: string;
      descricao: string;
      divisao: {
        id: string;
        descricao: string;
        secao: { id: string; descricao: string };
      };
    };
  };
}

function formatCodigo(id: string): string {
  return `${id.slice(0, 4)}-${id.slice(4, 5)}/${id.slice(5, 7)}`;
}

function formatClasse(id: string): string {
  return `${id.slice(0, 4)}-${id.slice(4)}`;
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|\s|\(|-|\/)([a-zà-ú])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

async function main() {
  const path = resolve(process.cwd(), 'prisma/data/cnae.json');
  const raw = readFileSync(path, 'utf-8');
  const subclasses = JSON.parse(raw) as IbgeSubclasse[];

  console.log(`Lendo ${subclasses.length} CNAEs do IBGE...`);

  const data = subclasses.map((sub) => {
    const classe = sub.classe;
    const grupo = classe.grupo;
    const divisao = grupo.divisao;
    const secao = divisao.secao;

    return {
      codigo: formatCodigo(sub.id),
      descricao: toTitleCase(sub.descricao),
      secao: secao.id,
      secaoDesc: toTitleCase(secao.descricao),
      divisao: divisao.id,
      grupo: grupo.id,
      classe: formatClasse(classe.id),
    };
  });

  const result = await prisma.cnaeCode.createMany({
    data,
    skipDuplicates: true,
  });

  console.log(`Inseridos: ${result.count} (já existentes ignorados)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
