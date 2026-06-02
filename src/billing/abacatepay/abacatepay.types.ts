// Contratos da API REST do AbacatePay (https://api.abacatepay.com/v2).
// NÃO são tabelas — só o formato do JSON trocado com a API externa.
// Shapes confirmados via sandbox (devMode) em 2026-05-30.

/** Envelope padrão de toda resposta da API. */
export interface AbacateEnvelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

/** Customer do lado do AbacatePay. Persistimos só o `id` (em Team.customerId). */
export interface AbacateCustomer {
  id: string; // ex.: "cust_..."
  name: string | null;
  email: string;
  taxId: string | null;
}

export interface CreateCustomerInput {
  name?: string;
  email: string;
  cellphone?: string;
  taxId?: string; // CPF/CNPJ — somente dígitos
}

export interface CreateSubscriptionInput {
  /** Exatamente um produto; o `cycle` (frequência) é definido no produto. */
  items: { id: string; quantity: number }[];
  customerId?: string;
  externalId?: string;
  completionUrl?: string;
  returnUrl?: string;
  /** Default ["CARD"]. Assinatura só aceita CARD (Pix não recorre). */
  methods?: ('CARD' | 'PIX')[];
  metadata?: Record<string, unknown>;
}

/** Retorno do checkout de assinatura (id no formato "bill_..."). */
export interface AbacateBilling {
  id: string;
  url: string;
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';
  customerId: string | null;
}

export interface CreateChargeInput {
  /** Valor da cobrança em centavos. */
  amount: number;
  /** Descrição exibida ao pagador. */
  description?: string;
  /** Referência idempotente do nosso lado (ex.: invoiceId). */
  externalId?: string;
  customerId?: string;
  metadata?: Record<string, unknown>;
  /** Minutos até o QR expirar (default do provider se omitido). */
  expiresIn?: number;
}

/**
 * Cobrança avulsa via Pix (QR Code) — usada p/ Invoices não-recorrentes, já que
 * Pix não recorre (ver spike). id no formato "pix_char_...".
 */
export interface AbacatePixCharge {
  id: string;
  amount: number; // centavos
  status: 'PENDING' | 'PAID' | 'EXPIRED' | 'CANCELLED' | 'REFUNDED';
  brCode: string; // copia-e-cola Pix
  brCodeBase64: string; // QR Code em data URI
  expiresAt: string | null; // ISO date
}

/** Body do POST /subscriptions/change-plan. */
export interface ChangePlanInput {
  /** ID da assinatura recorrente (`subs_...`). */
  id: string;
  /** ID do novo produto (`prod_...`) — precisa ter cycle definido. */
  productId: string;
  /** Quantidade do produto (mínimo 1). */
  quantity: number;
}

/**
 * Retorno do /subscriptions/change-plan. A mudança fica PENDING e é aplicada
 * no início do próximo ciclo de cobrança — o ciclo atual não é afetado.
 */
export interface AbacateSubscriptionUpdate {
  id: string;              // "subu_..."
  subscriptionId: string;  // "subs_..."
  status: 'PENDING' | 'APPLIED' | 'CANCELLED';
  productId: string;
  quantity: number;
  newAmount: number;       // valor em centavos
  requestedAt: string;     // ISO date
}

/**
 * Payload de webhook. ATENÇÃO: o shape exato de `data` ainda não foi
 * confirmado contra um evento real — tratado defensivamente no service.
 */
export interface AbacateWebhookPayload {
  event?: string;
  type?: string;
  name?: string;
  data?: Record<string, unknown>;
}
