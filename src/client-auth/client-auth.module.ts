import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ClientAuthController } from './client-auth.controller.js';
import { ClientAuthService } from './client-auth.service.js';
import { ClientJwtStrategy } from './strategies/client-jwt.strategy.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'change-me-in-production',
      signOptions: { expiresIn: 60 * 60 * 24 * 7 },
    }),
  ],
  controllers: [ClientAuthController],
  providers: [ClientAuthService, ClientJwtStrategy],
  exports: [ClientAuthService, ClientJwtStrategy],
})
export class ClientAuthModule {}
