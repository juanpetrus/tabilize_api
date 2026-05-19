import { chromium as chromiumExtra } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

chromiumExtra.use(StealthPlugin());
const chromium = chromiumExtra;

const CNPJ = process.argv[2]?.replace(/\D/g, '') || '21484031000135';
const OUT = join(process.cwd(), 'tmp', 'fgts-debug');

function ts() {
  return new Date().toISOString().slice(11, 23);
}
function log(msg: string) {
  console.log(`[${ts()}] ${msg}`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  log(`CNPJ alvo: ${CNPJ}`);
  log(`Saída: ${OUT}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  log('Browser lançado');

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  });

  const page = await context.newPage();

  page.on('console', (m) => log(`  [page.console:${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => log(`  [page.error] ${e.message}`));
  page.on('framenavigated', (f) =>
    log(`  [navigated] ${f.url().slice(0, 120)}`),
  );

  const dumpStep = async (name: string, p = page) => {
    const file = join(OUT, name);
    await p.screenshot({ path: `${file}.png`, fullPage: true });
    await writeFile(`${file}.html`, await p.content(), 'utf-8');
    log(`  → screenshot+html salvos: ${name}`);
  };

  try {
    log('1) Abrindo página de consulta...');
    await page.goto(
      'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
      { waitUntil: 'domcontentloaded', timeout: 30000 },
    );
    await dumpStep('01-pagina-inicial');

    log('2) Aguardando campo Inscrição...');
    await page.waitForSelector('input[name="mainForm:txtInscricao1"]', {
      timeout: 15000,
    });

    log('3) Preenchendo CNPJ...');
    await page.fill('input[name="mainForm:txtInscricao1"]', CNPJ);
    await dumpStep('02-cnpj-preenchido');

    log('4) Clicando em Consultar...');
    await Promise.all([
      page
        .waitForLoadState('networkidle', { timeout: 30000 })
        .catch(() => log('  ⚠ networkidle timeout')),
      page.click('input[name="mainForm:btnConsultar"]'),
    ]);
    await page.waitForTimeout(1500);
    await dumpStep('03-pos-consultar');

    const html1 = await page.content();
    const tem = (rx: RegExp) => rx.test(html1);
    log(
      `  detecção: REGULAR=${tem(/REGULAR\s+perante\s+o\s+FGTS/i)} IRREGULAR=${tem(/IRREGULAR/i)} naoEnc=${tem(/não foi encontrad|inscrição.*inválida/i)}`,
    );

    log('5) Procurando link "Certificado de Regularidade do FGTS"...');
    const link = await page.$(
      'a:has-text("Certificado de Regularidade do FGTS")',
    );
    if (!link) {
      log('  ✗ link não encontrado — abortando');
      await dumpStep('99-sem-link');
      return;
    }
    log('  ✓ link encontrado, clicando...');
    await Promise.all([
      page
        .waitForLoadState('networkidle', { timeout: 30000 })
        .catch(() => log('  ⚠ networkidle timeout')),
      link.click(),
    ]);
    await page.waitForTimeout(1500);
    await dumpStep('04-pagina-crf');

    log('6) Procurando botão Visualizar...');
    const btn = await page.$('input[name="mainForm:btnVisualizar"]');
    if (!btn) {
      log('  ✗ botão Visualizar não encontrado — abortando');
      await dumpStep('99-sem-btn');
      return;
    }
    log('  ✓ botão encontrado, clicando (esperando popup)...');

    const [popup] = await Promise.all([
      context
        .waitForEvent('page', { timeout: 15000 })
        .catch(() => null as any),
      btn.click(),
    ]);

    const finalPage = popup ?? page;
    log(`  popup aberto? ${!!popup}  url=${finalPage.url().slice(0, 100)}`);
    await finalPage
      .waitForLoadState('networkidle', { timeout: 30000 })
      .catch(() => log('  ⚠ networkidle final timeout'));
    await finalPage.waitForTimeout(1500);
    await dumpStep('05-certificado-final', finalPage);

    log('7) Gerando PDF da página final...');
    const pdf = await finalPage.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' },
    });
    const pdfPath = join(OUT, 'certificado.pdf');
    await writeFile(pdfPath, pdf);
    log(`  ✓ PDF salvo: ${pdfPath} (${pdf.length} bytes)`);

    log('CONCLUÍDO COM SUCESSO');
  } catch (err) {
    log(`✗ ERRO: ${err instanceof Error ? err.stack : String(err)}`);
    try {
      await dumpStep('99-erro');
    } catch {
      /* ignore */
    }
  } finally {
    await browser.close();
    log('Browser fechado');
  }
}

void main();
