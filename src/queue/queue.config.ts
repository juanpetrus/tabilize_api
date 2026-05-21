import { Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import basicAuth from 'express-basic-auth';
import type { RedisOptions } from 'bullmq';

/**
 * As filas (e o dashboard) só sobem quando há REDIS_URL — em produção/Railway.
 * Sem Redis (dev local), cada feature cai no seu fallback síncrono/inline.
 */
export function isQueueEnabled(): boolean {
  return !!process.env.REDIS_URL;
}

/**
 * Conexão Redis a partir do REDIS_URL.
 *
 * `family: 0` é necessário no Railway: a rede privada usa hostnames
 * `.railway.internal` que resolvem em IPv6, e o ioredis por padrão só tenta
 * IPv4 — sem isso a conexão falha com ENOTFOUND.
 *
 * `maxRetriesPerRequest: null` é exigido pelo BullMQ para as conexões de
 * trabalho (comandos bloqueantes).
 */
export function buildRedisConnection(): RedisOptions {
  const url = new URL(process.env.REDIS_URL as string);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    family: 0,
    maxRetriesPerRequest: null,
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

/**
 * Basic auth do Bull Board. Seguro por padrão: sem QUEUE_DASH_PASS definido,
 * a senha vira um valor aleatório (dashboard fica inacessível até configurar),
 * em vez de uma credencial fraca conhecida.
 */
export function buildDashboardAuth() {
  const user = process.env.QUEUE_DASH_USER ?? 'admin';
  let pass = process.env.QUEUE_DASH_PASS;
  if (!pass) {
    pass = randomBytes(24).toString('hex');
    new Logger('QueueModule').warn(
      'QUEUE_DASH_PASS não definido — Bull Board (/admin/queues) está com ' +
        'senha aleatória. Defina QUEUE_DASH_USER/QUEUE_DASH_PASS para acessar.',
    );
  }
  return basicAuth({ users: { [user]: pass }, challenge: true });
}
