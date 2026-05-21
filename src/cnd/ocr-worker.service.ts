import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { writeFile, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Mantém UM processo Python (scripts/ocr-worker.py) vivo e reaproveitado
 * entre todas as tentativas/consultas de captcha.
 *
 * Motivo: o worker carrega o easyocr.Reader (torch + pesos) uma única vez.
 * A versão antiga dava `spawn` por tentativa (até 20x), pagando o cold-start
 * do torch + load do modelo a cada vez — o que estourava o timeout de 30s no
 * Railway (vCPU limitada) e fazia o captcha nunca ser lido em produção.
 *
 * Requests são serializados (o Reader processa um por vez); cada requisição
 * escreve o caminho da imagem no stdin e lê a resposta correspondente do
 * stdout. Em timeout ou morte do processo, o worker é reiniciado no próximo uso.
 */
@Injectable()
export class OcrWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrWorkerService.name);

  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private startPromise: Promise<void> | null = null;
  private stdoutBuf = '';

  /** Resolve do __READY__ inicial (load do modelo). */
  private onReady: (() => void) | null = null;
  private onReadyFail: ((e: Error) => void) | null = null;

  /** Requisição em voo (serializada → no máximo uma por vez). */
  private pending: {
    resolve: (text: string) => void;
    timer: NodeJS.Timeout;
  } | null = null;

  /** Cadeia de serialização das requisições. */
  private tail: Promise<unknown> = Promise.resolve();

  private static readonly READY_TIMEOUT = 120_000; // load do modelo (CPU lenta)
  private static readonly REQUEST_TIMEOUT = 45_000; // só inferência (margem p/ vCPU lenta)

  async onModuleDestroy() {
    this.kill();
  }

  /**
   * Reconhece o captcha de uma imagem PNG. Retorna a string (6 chars) ou ''
   * se não conseguiu ler — nunca lança por captcha ruim.
   */
  recognize(imageBuf: Buffer): Promise<string> {
    // Serializa: encadeia depois do anterior, independente de sucesso/erro.
    const run = this.tail.then(
      () => this.recognizeOne(imageBuf),
      () => this.recognizeOne(imageBuf),
    );
    this.tail = run.catch(() => undefined);
    return run;
  }

  private async recognizeOne(imageBuf: Buffer): Promise<string> {
    try {
      await this.ensureWorker();
    } catch (err) {
      this.logger.error(
        `OCR worker indisponível: ${err instanceof Error ? err.message : err}`,
      );
      return '';
    }

    const dir = await mkdtemp(join(tmpdir(), 'cndt-captcha-'));
    const imgPath = join(dir, 'captcha.png');
    try {
      await writeFile(imgPath, imageBuf);
      return await this.sendRequest(imgPath);
    } catch (err) {
      this.logger.warn(
        `Falha no OCR worker: ${err instanceof Error ? err.message : err}`,
      );
      return '';
    } finally {
      void rm(dir, { recursive: true, force: true });
    }
  }

  private sendRequest(imgPath: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const proc = this.proc;
      if (!proc || !this.ready) {
        reject(new Error('worker não está pronto'));
        return;
      }

      const timer = setTimeout(() => {
        this.pending = null;
        // stdout pode ter dessincronizado → reinicia o worker.
        this.logger.warn('OCR worker timeout — reiniciando');
        this.kill();
        reject(new Error('request timeout'));
      }, OcrWorkerService.REQUEST_TIMEOUT);

      this.pending = { resolve, timer };
      proc.stdin.write(`${imgPath}\n`);
    });
  }

  private ensureWorker(): Promise<void> {
    if (this.proc && this.ready) return Promise.resolve();
    if (this.startPromise) return this.startPromise;

    this.startPromise = this.start().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const scriptPath = join(process.cwd(), 'scripts', 'ocr-worker.py');
      this.logger.log('Iniciando OCR worker (carregando modelo EasyOCR)...');

      let proc: ChildProcessWithoutNullStreams;
      try {
        proc = spawn('python3', [scriptPath]);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('spawn falhou'));
        return;
      }

      this.proc = proc;
      this.ready = false;
      this.stdoutBuf = '';

      const readyTimer = setTimeout(() => {
        this.logger.error('OCR worker não ficou pronto em 120s');
        this.onReady = null;
        this.onReadyFail = null;
        this.kill();
        reject(new Error('ready timeout'));
      }, OcrWorkerService.READY_TIMEOUT);

      this.onReady = () => {
        clearTimeout(readyTimer);
        this.ready = true;
        this.onReady = null;
        this.onReadyFail = null;
        this.logger.log('OCR worker pronto');
        resolve();
      };
      this.onReadyFail = (e: Error) => {
        clearTimeout(readyTimer);
        this.onReady = null;
        this.onReadyFail = null;
        reject(e);
      };

      proc.stdout.on('data', (c: Buffer) => this.onStdout(c.toString()));
      proc.stderr.on('data', (c: Buffer) => {
        // Loga cada linha do worker Python separadamente (diagnóstico no Railway).
        for (const line of c.toString().split('\n')) {
          const s = line.trim();
          if (s) this.logger.log(`py: ${s}`);
        }
      });

      proc.on('error', (err) => {
        this.logger.error(`OCR worker erro de processo: ${err.message}`);
        this.failAll(err);
      });

      proc.on('exit', (code, signal) => {
        if (this.proc === proc) {
          this.proc = null;
          this.ready = false;
        }
        const reason = `OCR worker encerrou (code=${code} signal=${signal})`;
        if (code !== 0 && code !== null) this.logger.warn(reason);
        this.failAll(new Error(reason));
      });
    });
  }

  /** Processa chunks do stdout, quebrando em linhas completas. */
  private onStdout(chunk: string) {
    this.stdoutBuf += chunk;
    let idx: number;
    while ((idx = this.stdoutBuf.indexOf('\n')) !== -1) {
      const line = this.stdoutBuf.slice(0, idx);
      this.stdoutBuf = this.stdoutBuf.slice(idx + 1);
      this.handleLine(line.trim());
    }
  }

  private handleLine(line: string) {
    if (!this.ready) {
      if (line === '__READY__') {
        this.onReady?.();
      }
      // Qualquer outra linha antes do ready é ruído de inicialização.
      return;
    }

    const pending = this.pending;
    if (!pending) return; // resposta sem requisição (ex.: após timeout) → ignora
    this.pending = null;
    clearTimeout(pending.timer);
    // Normaliza igual ao consumo antigo: só [a-z0-9], minúsculo.
    const text = line.replace(/[^a-z0-9]/gi, '').toLowerCase();
    pending.resolve(text);
  }

  /** Rejeita ready pendente e a requisição em voo (worker morreu/erro). */
  private failAll(err: Error) {
    this.onReadyFail?.(err);
    if (this.pending) {
      clearTimeout(this.pending.timer);
      // Resolve vazio em vez de lançar: o loop de captcha apenas recarrega.
      const { resolve } = this.pending;
      this.pending = null;
      resolve('');
    }
  }

  private kill() {
    const proc = this.proc;
    this.proc = null;
    this.ready = false;
    if (proc) {
      proc.removeAllListeners();
      proc.kill('SIGKILL');
    }
  }
}
