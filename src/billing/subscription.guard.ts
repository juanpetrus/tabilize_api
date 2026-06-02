import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';

/**
 * Guard global de billing. Fonte-de-verdade = a Subscription vigente do team
 * (a mais recente). Semântica (SDD §05):
 *   • TRIAL (não expirado) / ACTIVE → passa
 *   • PAST_DUE                       → passa, mas injeta `req.billingPastDue`
 *   • SUSPENDED / CANCELLED          → 402 Payment Required
 *   • TRIAL expirado                 → 402 (antes do cron flipar p/ SUSPENDED)
 *
 * Fallback: se o team ainda não tem Subscription (não backfillado), cai na
 * lógica legada sobre Team.subscription* — evita lockout durante a transição.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: { id: string };
      params?: { teamId?: string };
      billingPastDue?: boolean;
    }>();
    const userId = request.user?.id;
    const teamId = request.params?.teamId;

    if (!userId || !teamId) return true;

    const subscription = await this.prisma.subscription.findFirst({
      where: { teamId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, trialEndsAt: true },
    });

    if (!subscription) return this.legacyTeamCheck(teamId);

    switch (subscription.status) {
      case 'ACTIVE':
        return true;

      case 'PAST_DUE':
        // Acesso mantido, mas sinaliza inadimplência p/ a UI/banner.
        request.billingPastDue = true;
        return true;

      case 'TRIAL':
        if (subscription.trialEndsAt.getTime() > Date.now()) return true;
        throw new HttpException(
          {
            code: 'TRIAL_EXPIRED',
            message:
              'Seu período de trial expirou. Assine um plano para continuar.',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );

      case 'SUSPENDED':
      case 'CANCELLED':
      default:
        throw new HttpException(
          {
            code: 'SUBSCRIPTION_REQUIRED',
            message: 'Assinatura necessária para acessar este recurso.',
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
    }
  }

  /** Lógica legada (Team.subscription*) — usada só enquanto houver teams sem Subscription. */
  private async legacyTeamCheck(teamId: string): Promise<boolean> {
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, isActive: true },
      select: { subscriptionStatus: true, subscriptionExpiry: true },
    });

    if (!team) return true;

    if (team.subscriptionStatus === 'ACTIVE') return true;

    if (team.subscriptionStatus === 'TRIAL') {
      if (
        team.subscriptionExpiry &&
        team.subscriptionExpiry.getTime() > Date.now()
      )
        return true;

      throw new ForbiddenException({
        code: 'TRIAL_EXPIRED',
        message:
          'Seu período de trial expirou. Assine um plano para continuar.',
      });
    }

    throw new ForbiddenException({
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Assinatura necessária para acessar este recurso.',
    });
  }
}
