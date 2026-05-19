import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PartnerAuthService } from '../partner-auth.service.js';

export interface PartnerJwtPayload {
  sub: string;
  email: string;
  type: 'partner';
}

@Injectable()
export class PartnerJwtStrategy extends PassportStrategy(
  Strategy,
  'partner-jwt',
) {
  constructor(private readonly partnerAuthService: PartnerAuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-in-production',
    });
  }

  async validate(payload: PartnerJwtPayload) {
    if (payload.type !== 'partner') {
      throw new UnauthorizedException(
        'Token inválido para portal de parceiros',
      );
    }

    const partner = await this.partnerAuthService.validatePartner(payload.sub);

    if (!partner) {
      throw new UnauthorizedException('Parceiro não encontrado ou inativo');
    }

    return partner;
  }
}
