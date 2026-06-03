import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import type {
  AbacateBilling,
  AbacateCustomer,
  AbacateEnvelope,
  AbacatePixCharge,
  AbacateSubscriptionUpdate,
  ChangePlanInput,
  CreateChargeInput,
  CreateCustomerInput,
  CreateSubscriptionInput,
} from './abacatepay.types.js';

const DEFAULT_BASE_URL = 'https://api.abacatepay.com/v2';

/**
 * Client de baixo nível da API do AbacatePay.
 * Faz auth, desempacota o envelope `{ success, data, error }` e normaliza erros.
 * Retry automático SOMENTE em GET (POSTs como criar assinatura não são idempotentes).
 */
@Injectable()
export class AbacatepayClient {
  private readonly logger = new Logger(AbacatepayClient.name);
  private readonly http: AxiosInstance;

  constructor() {
    const apiKey = process.env['ABACATEPAY_SECRET_KEY'] ?? '';
    if (!apiKey) {
      this.logger.warn(
        'ABACATEPAY_SECRET_KEY ausente — chamadas ao AbacatePay vão falhar.',
      );
    }

    this.http = axios.create({
      baseURL: process.env['ABACATEPAY_BASE_URL'] ?? DEFAULT_BASE_URL,
      timeout: 20_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  // ─── Endpoints ────────────────────────────────────────────────────────────

  /** Cria (ou retorna o existente, por taxId) um customer. */
  createCustomer(input: CreateCustomerInput): Promise<AbacateCustomer> {
    console.log(input);
    return this.post<AbacateCustomer>('/customers/create', input);
  }

  /** Cria o checkout de uma assinatura recorrente. Retorna `url` + `id`. */
  createSubscription(input: CreateSubscriptionInput): Promise<AbacateBilling> {
    console.log('createSubscription', input);
    return this.post<AbacateBilling>('/subscriptions/create', {
      methods: ['CARD'],
      ...input,
    });
  }

  /**
   * Cria uma cobrança avulsa via Pix (QR Code). Usada p/ Invoices não-recorrentes
   * (Pix não recorre — ver spike). Retorna o copia-e-cola + QR em base64.
   * ⚠️ Endpoint/shape ainda não validados contra o sandbox (pendência do board §03).
   */
  createCharge(input: CreateChargeInput): Promise<AbacatePixCharge> {
    return this.post<AbacatePixCharge>('/pixQrCode/create', input);
  }

  /** Cancela a assinatura imediatamente (cancelPolicy NOW, sem carência). */
  cancelSubscription(id: string): Promise<AbacateBilling> {
    return this.post<AbacateBilling>('/subscriptions/cancel', { id });
  }

  /**
   * Troca de plano: mudança agendada (PENDING) que entra em vigor no próximo
   * ciclo de cobrança. Não cobra nada no ciclo atual.
   */
  changePlan(input: ChangePlanInput): Promise<AbacateSubscriptionUpdate> {
    return this.post<AbacateSubscriptionUpdate>(
      '/subscriptions/change-plan',
      input,
    );
  }

  // ─── Transporte ───────────────────────────────────────────────────────────

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('post', path, body);
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    body?: unknown,
    attempt = 1,
  ): Promise<T> {
    try {
      const res = await this.http.request<AbacateEnvelope<T>>({
        method,
        url: path,
        data: body,
      });

      if (!res.data?.success || res.data.data == null) {
        throw new ServiceUnavailableException(
          `AbacatePay: ${res.data?.error ?? 'resposta sem dados'}`,
        );
      }

      return res.data.data;
    } catch (err) {
      // Retry só em GET e só em falha de rede/5xx (POST não é idempotente).
      const retriable =
        method === 'get' &&
        attempt < 3 &&
        isAxiosError(err) &&
        (!err.response || err.response.status >= 500);

      if (retriable) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        return this.request<T>(method, path, body, attempt + 1);
      }

      if (isAxiosError(err)) {
        const apiError = (err.response?.data as AbacateEnvelope<unknown>)
          ?.error;
        this.logger.error(
          `AbacatePay ${method.toUpperCase()} ${path} falhou: ${
            apiError ?? err.message
          }`,
        );
        throw new ServiceUnavailableException(
          `Falha ao comunicar com o provedor de pagamento${
            apiError ? `: ${apiError}` : ''
          }`,
        );
      }

      throw err;
    }
  }
}
