import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { PartnerAuthController } from './partner-auth.controller.js';
import { PartnerAuthService } from './partner-auth.service.js';
import { PartnerJwtStrategy } from './strategies/partner-jwt.strategy.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-production',
      signOptions: { expiresIn: 60 * 60 * 24 * 7 },
    }),
  ],
  controllers: [PartnerAuthController],
  providers: [PartnerAuthService, PartnerJwtStrategy],
  exports: [PartnerAuthService, PartnerJwtStrategy],
})
export class PartnerAuthModule {}
