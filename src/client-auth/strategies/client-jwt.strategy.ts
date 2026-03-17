import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ClientAuthService } from '../client-auth.service.js';

export interface ClientJwtPayload {
  sub: string;
  email: string;
  companyId: string;
  type: 'client';
}

@Injectable()
export class ClientJwtStrategy extends PassportStrategy(Strategy, 'client-jwt') {
  constructor(private readonly clientAuthService: ClientAuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-production',
    });
  }

  async validate(payload: ClientJwtPayload) {
    if (payload.type !== 'client') {
      throw new UnauthorizedException('Token inválido para portal cliente');
    }

    const companyUser = await this.clientAuthService.validateCompanyUser(payload.sub);

    if (!companyUser) {
      throw new UnauthorizedException('Usuário não encontrado ou inativo');
    }

    return companyUser;
  }
}
