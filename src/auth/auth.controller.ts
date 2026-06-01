import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Cadastra um novo usuário/escritório',
    description:
      'Cria o User titular, o Team (escritório) e dispara o fluxo de assinatura no plano informado.',
  })
  @ApiResponse({ status: 201, description: 'Conta criada com sucesso (retorna JWT e dados do usuário).' })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  @ApiResponse({ status: 409, description: 'Email já cadastrado.' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Autentica usuário e retorna JWT' })
  @ApiResponse({ status: 200, description: 'Login bem-sucedido (retorna access_token).' })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas.' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('forgot-password')
  @ApiOperation({
    summary: 'Solicita link de redefinição de senha',
    description: 'Envia email com token de redefinição. Sempre retorna 200 (evita enumeração de emails).',
  })
  @ApiResponse({ status: 200, description: 'Solicitação processada.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Redefine a senha usando o token recebido por email' })
  @ApiResponse({ status: 200, description: 'Senha redefinida com sucesso.' })
  @ApiResponse({ status: 400, description: 'Token inválido ou expirado.' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiExcludeEndpoint()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: { user: { id: string } }) {
    return this.authService.me(req.user.id);
  }

  @ApiExcludeEndpoint()
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async update(
    @Req() req: { user: { id: string } },
    @Body() dto: UpdateUserDto,
  ) {
    return this.authService.updateUser(req.user.id, dto);
  }

  @ApiExcludeEndpoint()
  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async delete(@Req() req: { user: { id: string } }) {
    return this.authService.deleteUser(req.user.id);
  }
}
