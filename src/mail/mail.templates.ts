const BASE_URL = process.env['FRONTEND_URL'] ?? 'https://tabilize.com.br';

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tabilize</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #f0f0f0;">
              <a href="${BASE_URL}" style="text-decoration:none;">
                <span style="font-size:22px;font-weight:700;color:#18181b;letter-spacing:-0.5px;">Tabilize</span>
              </a>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:36px 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f0f0f0;background:#fafafa;">
              <p style="margin:0;font-size:12px;color:#a1a1aa;line-height:1.6;">
                Você está recebendo este email porque tem uma conta na
                <a href="${BASE_URL}" style="color:#6366f1;text-decoration:none;">Tabilize</a>.
                <br/>© ${new Date().getFullYear()} Tabilize. Todos os direitos reservados.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;margin:8px 0;">${text}</a>`;
}

function badge(text: string, color = '#6366f1'): string {
  return `<span style="display:inline-block;background:${color}18;color:${color};font-size:12px;font-weight:600;padding:4px 10px;border-radius:100px;margin-bottom:16px;">${text}</span>`;
}

function heading(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#18181b;letter-spacing:-0.5px;">${text}</h1>`;
}

function paragraph(text: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;color:#52525b;line-height:1.7;">${text}</p>`;
}

function divider(): string {
  return `<hr style="border:none;border-top:1px solid #f0f0f0;margin:24px 0;" />`;
}

function infoBox(content: string): string {
  return `<div style="background:#f4f4f5;border-radius:8px;padding:16px 20px;margin:20px 0;">${content}</div>`;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export function welcomeTemplate(name: string, trialExpiry: string): string {
  return layout(`
    ${badge('Bem-vindo!')}
    ${heading(`Olá, ${name}! 👋`)}
    ${paragraph('Sua conta foi criada com sucesso. Estamos felizes em ter você na Tabilize.')}
    ${paragraph(`Você tem <strong style="color:#18181b;">14 dias de acesso gratuito</strong> para explorar tudo que a plataforma oferece.`)}
    ${infoBox(`
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#18181b;">Seu trial expira em</p>
      <p style="margin:0;font-size:15px;color:#52525b;">${trialExpiry}</p>
    `)}
    ${paragraph('Comece agora e veja como a Tabilize pode organizar o seu escritório.')}
    ${button('Acessar a plataforma', BASE_URL)}
    ${divider()}
    ${paragraph('<span style="font-size:13px;color:#a1a1aa;">Qualquer dúvida, responda este email. Estamos aqui para ajudar.</span>')}
  `);
}

export function trialCardSavedTemplate(name: string, trialExpiry: string): string {
  return layout(`
    ${badge('Trial ativo', '#16a34a')}
    ${heading('Cartão salvo com sucesso ✅')}
    ${paragraph(`Olá, ${name}! Seu cartão foi registrado e o seu trial está ativo.`)}
    ${infoBox(`
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#18181b;">Nenhuma cobrança até</p>
      <p style="margin:0;font-size:15px;color:#52525b;">${trialExpiry}</p>
    `)}
    ${paragraph('Após o período de trial, a cobrança será realizada automaticamente no cartão cadastrado. Você pode cancelar a qualquer momento.')}
    ${button('Gerenciar assinatura', `${BASE_URL}/settings/billing`)}
  `);
}

export function subscriptionActiveTemplate(name: string, nextBillingDate: string): string {
  return layout(`
    ${badge('Assinatura ativa', '#16a34a')}
    ${heading('Obrigado por assinar a Tabilize! 🎉')}
    ${paragraph(`Olá, ${name}! Sua assinatura está ativa e seu acesso foi confirmado.`)}
    ${infoBox(`
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#18181b;">Próxima cobrança</p>
      <p style="margin:0;font-size:15px;color:#52525b;">${nextBillingDate}</p>
    `)}
    ${button('Acessar a plataforma', BASE_URL)}
  `);
}

export function paymentFailedTemplate(name: string): string {
  return layout(`
    ${badge('Ação necessária', '#dc2626')}
    ${heading('Problema no pagamento ⚠️')}
    ${paragraph(`Olá, ${name}! Identificamos um problema ao processar o pagamento da sua assinatura.`)}
    ${paragraph('Para evitar a suspensão do acesso, por favor atualize seu cartão de crédito.')}
    ${button('Atualizar cartão', `${BASE_URL}/settings/billing`)}
    ${divider()}
    ${paragraph('<span style="font-size:13px;color:#a1a1aa;">Se precisar de ajuda, responda este email.</span>')}
  `);
}

export function subscriptionCancelledTemplate(name: string, accessUntil: string): string {
  return layout(`
    ${badge('Cancelamento confirmado')}
    ${heading('Sua assinatura foi cancelada')}
    ${paragraph(`Olá, ${name}! Confirmamos o cancelamento da sua assinatura.`)}
    ${infoBox(`
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#18181b;">Acesso garantido até</p>
      <p style="margin:0;font-size:15px;color:#52525b;">${accessUntil}</p>
    `)}
    ${paragraph('Você pode reativar sua assinatura a qualquer momento antes dessa data.')}
    ${button('Reativar assinatura', `${BASE_URL}/settings/billing`)}
  `);
}

export function forgotPasswordTemplate(name: string, resetUrl: string): string {
  return layout(`
    ${badge('Redefinição de senha')}
    ${heading('Esqueceu sua senha?')}
    ${paragraph(`Olá, ${name}! Recebemos uma solicitação para redefinir a senha da sua conta.`)}
    ${paragraph('Clique no botão abaixo para criar uma nova senha. Este link expira em <strong style="color:#18181b;">1 hora</strong>.')}
    ${button('Redefinir senha', resetUrl)}
    ${divider()}
    ${paragraph('<span style="font-size:13px;color:#a1a1aa;">Se você não solicitou a redefinição, ignore este email. Sua senha permanece a mesma.</span>')}
  `);
}
