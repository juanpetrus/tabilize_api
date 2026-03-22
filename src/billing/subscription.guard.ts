import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: { id: string }; params?: { teamId?: string } }>();
    const userId = request.user?.id;
    const teamId = request.params?.teamId;

    if (!userId || !teamId) return true;

    const team = await this.prisma.team.findFirst({
      where: { id: teamId, isActive: true },
      select: { subscriptionStatus: true, subscriptionExpiry: true },
    });

    if (!team) return true;

    const { subscriptionStatus, subscriptionExpiry } = team;

    if (subscriptionStatus === 'ACTIVE') return true;

    if (subscriptionStatus === 'TRIAL') {
      if (subscriptionExpiry && subscriptionExpiry.getTime() > Date.now()) return true;

      throw new ForbiddenException({
        code: 'TRIAL_EXPIRED',
        message: 'Seu período de trial expirou. Assine um plano para continuar.',
      });
    }

    throw new ForbiddenException({
      code: 'SUBSCRIPTION_REQUIRED',
      message: 'Assinatura necessária para acessar este recurso.',
    });
  }
}
