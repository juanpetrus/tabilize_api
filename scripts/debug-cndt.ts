import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { spawn } from 'child_process';

const CNPJ = process.argv[2]?.replace(/\D/g, '') || '21484031000135';
const OUT = join(process.cwd(), 'tmp', 'cndt-debug');
const MAX = 10;
const OCR_SCRIPT = join(process.cwd(), 'scripts', 'ocr-segmented.py');

function ts() {
  return new Date().toISOString().slice(11, 23);
}
function log(msg: string) {
  console.log(`[${ts()}] ${msg}`);
}

function runOcr(imagePath: string): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('python3', [OCR_SCRIPT, imagePath]);
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => (out += c.toString()));
    proc.stderr.on('data', (c) => (err += c.toString()));
    proc.on('close', () => {
      if (err.trim()) {
        // stderr é diagnóstico (não-erro). Mostra resumido.
        const line = err
          .split('\n')
          .find((l) => l.includes('segmentos:') || l.includes('passaram'));
        if (line) log(`  py: ${line.trim()}`);
      }
      resolve(out.trim());
    });
    proc.on('error', () => resolve(''));
  });
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

  try {
    for (let n = 1; n <= MAX; n++) {
      log(`--- Tentativa ${n}/${MAX} ---`);

      await page.goto(
        'https://cndt-certidao.tst.jus.br/gerarCertidao.faces',
        { waitUntil: 'networkidle', timeout: 30000 },
      );

      await page.waitForSelector('input[id="gerarCertidaoForm:cpfCnpj"]', {
        timeout: 15000,
      });
      await page.fill('input[id="gerarCertidaoForm:cpfCnpj"]', CNPJ);

      // Aguarda o captcha aparecer com base64 válido
      const captchaSrc = await page
        .waitForFunction(
          () => {
            const img = document.querySelector(
              'img[id="idImgBase64"]',
            ) as HTMLImageElement | null;
            return img?.src && img.src.includes('base64,') ? img.src : null;
          },
          { timeout: 10000 },
        )
        .then((h) => h.jsonValue() as Promise<string | null>)
        .catch(() => null);

      if (!captchaSrc || !captchaSrc.includes('base64,')) {
        log('  ✗ captcha base64 não apareceu em 10s');
        continue;
      }

      const b64 = captchaSrc.split('base64,')[1];
      const raw = Buffer.from(b64, 'base64');

      const rawPath = join(OUT, `cap-${n}-raw.png`);
      await writeFile(rawPath, raw);

      const t0 = Date.now();
      const txt = await runOcr(rawPath);
      const dt = Date.now() - t0;
      log(`  OCR: "${txt}" em ${dt}ms`);

      if (txt.length < 4) {
        log('  ✗ texto curto, retry');
        continue;
      }

      await page.fill('input[id="idCampoResposta"]', txt);

      const dlPromise = page
        .waitForEvent('download', { timeout: 15000 })
        .catch(() => null);
      await page.click('input[id="gerarCertidaoForm:btnEmitirCertidao"]');

      const download = await dlPromise;

      if (download) {
        const tmp = await download.path();
        if (tmp) {
          const buf = await readFile(tmp);
          const final = join(OUT, 'certidao.pdf');
          await writeFile(final, buf);
          log(`  ✓ PDF salvo: ${final} (${buf.length} bytes)`);
          log(`SUCESSO em ${n} tentativa(s) - resposta="${txt}"`);
          return;
        }
      }

      await page.waitForTimeout(1500);
      const html = (await page.content()).toLowerCase();

      if (
        /consta no banco nacional|inadimplente|certid[aã]o positiva/.test(html)
      ) {
        log('  ⚠ Certidão POSITIVA (há débitos)');
        return;
      }

      log(`  ✗ Captcha rejeitado (resposta="${txt}")`);
    }

    log(`FALHA: ${MAX} tentativas sem sucesso`);
  } catch (err) {
    log(`✗ ERRO: ${err instanceof Error ? err.stack : String(err)}`);
  } finally {
    await browser.close();
    log('Recursos liberados');
  }
}

void main();
