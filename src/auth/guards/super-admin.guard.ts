import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ user?: { isSuperAdmin?: boolean } }>();
    if (!req.user?.isSuperAdmin) {
      throw new ForbiddenException(
        'Acesso restrito a administradores Tabilize',
      );
    }
    return true;
  }
}
