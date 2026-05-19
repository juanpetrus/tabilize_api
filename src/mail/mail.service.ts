import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import {
  welcomeTemplate,
  trialCardSavedTemplate,
  subscriptionActiveTemplate,
  paymentFailedTemplate,
  subscriptionCancelledTemplate,
  forgotPasswordTemplate,
  nfeToCustomerTemplate,
  partnerPendingApprovalTemplate,
  partnerApprovedTemplate,
  partnerRejectedTemplate,
  partnerForgotPasswordTemplate,
} from './mail.templates.js';

const resend = new Resend(process.env['RESEND_API_KEY']);
const FROM = 'Tabilize <noreply@tabilize.com.br>';

@Injectable()
export class MailService {
  async sendWelcome(to: string, name: string, trialExpiry: Date) {
    const expiryDate = trialExpiry.toLocaleDateString('pt-BR');
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Bem-vindo à Tabilize! 🎉',
      html: welcomeTemplate(name, expiryDate),
    });
  }

  async sendTrialCardSaved(to: string, name: string, trialExpiry: Date) {
    const expiryDate = trialExpiry.toLocaleDateString('pt-BR');
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Cartão salvo — seu trial está ativo ✅',
      html: trialCardSavedTemplate(name, expiryDate),
    });
  }

  async sendSubscriptionActive(
    to: string,
    name: string,
    nextBillingDate: Date,
  ) {
    const nextDate = nextBillingDate.toLocaleDateString('pt-BR');
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Assinatura ativada com sucesso ✅',
      html: subscriptionActiveTemplate(name, nextDate),
    });
  }

  async sendPaymentFailed(to: string, name: string) {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Problema no pagamento — ação necessária ⚠️',
      html: paymentFailedTemplate(name),
    });
  }

  async sendSubscriptionCancelled(to: string, name: string, accessUntil: Date) {
    const accessDate = accessUntil.toLocaleDateString('pt-BR');
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Cancelamento confirmado',
      html: subscriptionCancelledTemplate(name, accessDate),
    });
  }

  async sendForgotPassword(to: string, name: string, resetUrl: string) {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Redefinir sua senha',
      html: forgotPasswordTemplate(name, resetUrl),
    });
  }

  // ─── Partners ───────────────────────────────────────────────────────────

  async sendPartnerPendingApproval(to: string, name: string) {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Cadastro recebido — em análise',
      html: partnerPendingApprovalTemplate(name),
    });
  }

  async sendPartnerApproved(
    to: string,
    name: string,
    slug: string,
    refUrl: string,
  ) {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Seu cadastro foi aprovado! 🎉',
      html: partnerApprovedTemplate(name, slug, refUrl),
    });
  }

  async sendPartnerRejected(to: string, name: string, reason: string) {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Sobre seu cadastro como parceiro',
      html: partnerRejectedTemplate(name, reason),
    });
  }

  async sendPartnerForgotPassword(to: string, name: string, resetUrl: string) {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Redefinir senha do painel de parceiro',
      html: partnerForgotPasswordTemplate(name, resetUrl),
    });
  }

  async sendNfeToCustomer(params: {
    to: string;
    customerName: string;
    emitenteNome: string;
    numero: number;
    serie: string;
    chave: string;
    xmlBuffer: Buffer;
    pdfBuffer: Buffer;
    cc?: string[];
  }): Promise<void> {
    await resend.emails.send({
      from: FROM,
      to: params.to,
      ...(params.cc && params.cc.length > 0 ? { cc: params.cc } : {}),
      subject: `NF-e ${params.numero} série ${params.serie} - ${params.emitenteNome}`,
      html: nfeToCustomerTemplate({
        customerName: params.customerName,
        emitenteNome: params.emitenteNome,
        numero: params.numero,
        serie: params.serie,
        chave: params.chave,
      }),
      attachments: [
        {
          filename: `${params.chave}-nfe.xml`,
          content: params.xmlBuffer.toString('base64'),
        },
        {
          filename: `${params.chave}-danfe.pdf`,
          content: params.pdfBuffer.toString('base64'),
        },
      ],
    });
  }
}
