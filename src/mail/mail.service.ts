import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import {
  welcomeTemplate,
  trialCardSavedTemplate,
  subscriptionActiveTemplate,
  paymentFailedTemplate,
  subscriptionCancelledTemplate,
  forgotPasswordTemplate,
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

  async sendSubscriptionActive(to: string, name: string, nextBillingDate: Date) {
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
}
