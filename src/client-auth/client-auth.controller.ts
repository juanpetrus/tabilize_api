import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ClientAuthService } from './client-auth.service.js';
import { ClientRegisterDto } from './dto/client-register.dto.js';
import { ClientLoginDto } from './dto/client-login.dto.js';
import { ClientJwtGuard } from './guards/client-jwt.guard.js';

interface ClientAuthRequest {
  user: { id: string; name: string; email: string; companyId: string };
}

@Controller('client-auth')
export class ClientAuthController {
  constructor(private readonly clientAuthService: ClientAuthService) {}

  @Post('companies/:companyId/register')
  register(@Param('companyId') companyId: string, @Body() dto: ClientRegisterDto) {
    return this.clientAuthService.register(companyId, dto);
  }

  @Post('login')
  login(@Body() dto: ClientLoginDto) {
    return this.clientAuthService.login(dto);
  }

  @UseGuards(ClientJwtGuard)
  @Get('me')
  me(@Req() req: ClientAuthRequest) {
    const { id, name, email, companyId } = req.user;
    return { companyUser: { id, name, email, companyId } };
  }

  /**
   * Lista todas as empresas que o cliente tem acesso
   */
  @UseGuards(ClientJwtGuard)
  @Get('companies')
  listCompanies(@Req() req: ClientAuthRequest) {
    return this.clientAuthService.listCompanies(req.user.id);
  }

  /**
   * Troca a empresa ativa do cliente
   */
  @UseGuards(ClientJwtGuard)
  @Post('switch-company/:companyId')
  switchCompany(@Req() req: ClientAuthRequest, @Param('companyId') companyId: string) {
    return this.clientAuthService.switchCompany(req.user.id, companyId);
  }
}
