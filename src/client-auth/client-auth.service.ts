import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/index.js';
import { ClientRegisterDto } from './dto/client-register.dto.js';
import { ClientLoginDto } from './dto/client-login.dto.js';

@Injectable()
export class ClientAuthService {
  private readonly saltRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(companyId: string, dto: ClientRegisterDto) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    const existing = await this.prisma.companyUser.findUnique({
      where: { email: dto.email },
    });

    if (existing) throw new ConflictException('E-mail já cadastrado');

    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);

    const companyUser = await this.prisma.companyUser.create({
      data: {
        companyId: company.id,
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
      },
    });

    const token = this.generateToken(companyUser.id, companyUser.email, company.id);
    return this.formatResponse(companyUser, token);
  }

  async login(dto: ClientLoginDto) {
    const companyUser = await this.prisma.companyUser.findUnique({
      where: { email: dto.email },
      include: { company: { select: { id: true, name: true, isActive: true } } },
    });

    if (!companyUser || !companyUser.isActive || !companyUser.company.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, companyUser.password);

    if (!isPasswordValid) throw new UnauthorizedException('Credenciais inválidas');

    const token = this.generateToken(companyUser.id, companyUser.email, companyUser.companyId);
    return this.formatResponse(companyUser, token);
  }

  async validateCompanyUser(companyUserId: string) {
    return this.prisma.companyUser.findUnique({
      where: { id: companyUserId, isActive: true },
      include: { company: { select: { id: true, name: true, teamId: true } } },
    });
  }

  private generateToken(companyUserId: string, email: string, companyId: string) {
    return this.jwtService.sign(
      { sub: companyUserId, email, companyId, type: 'client' },
      { expiresIn: 60 * 60 * 24 * 7 },
    );
  }

  private formatResponse(
    companyUser: { id: string; name: string; email: string; companyId: string },
    token: string,
  ) {
    return {
      companyUser: {
        id: companyUser.id,
        name: companyUser.name,
        email: companyUser.email,
        companyId: companyUser.companyId,
      },
      accessToken: token,
    };
  }
}
