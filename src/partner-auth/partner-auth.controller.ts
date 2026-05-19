import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PartnerAuthService } from './partner-auth.service.js';
import { PartnerRegisterDto } from './dto/partner-register.dto.js';
import { PartnerLoginDto } from './dto/partner-login.dto.js';
import { PartnerForgotPasswordDto } from './dto/partner-forgot-password.dto.js';
import { PartnerResetPasswordDto } from './dto/partner-reset-password.dto.js';
import { PartnerUpdateMeDto } from './dto/partner-update-me.dto.js';
import { PartnerJwtGuard } from './guards/partner-jwt.guard.js';

interface PartnerAuthRequest {
  user: {
    id: string;
    name: string;
    email: string;
    slug: string;
    status: string;
  };
}

@Controller('partner-auth')
export class PartnerAuthController {
  constructor(private readonly partnerAuthService: PartnerAuthService) {}

  @Post('register')
  register(@Body() dto: PartnerRegisterDto) {
    return this.partnerAuthService.register(dto);
  }

  @Post('login')
  login(@Body() dto: PartnerLoginDto) {
    return this.partnerAuthService.login(dto);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: PartnerForgotPasswordDto) {
    return this.partnerAuthService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: PartnerResetPasswordDto) {
    return this.partnerAuthService.resetPassword(dto);
  }

  @UseGuards(PartnerJwtGuard)
  @Get('me')
  me(@Req() req: PartnerAuthRequest) {
    return this.partnerAuthService.me(req.user.id);
  }

  @UseGuards(PartnerJwtGuard)
  @Patch('me')
  updateMe(@Req() req: PartnerAuthRequest, @Body() dto: PartnerUpdateMeDto) {
    return this.partnerAuthService.updateMe(req.user.id, dto);
  }
}
