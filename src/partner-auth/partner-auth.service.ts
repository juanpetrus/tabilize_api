import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../database/index.js';
import { MailService } from '../mail/mail.service.js';
import { PartnerRegisterDto } from './dto/partner-register.dto.js';
import { PartnerLoginDto } from './dto/partner-login.dto.js';
import { PartnerForgotPasswordDto } from './dto/partner-forgot-password.dto.js';
import { PartnerResetPasswordDto } from './dto/partner-reset-password.dto.js';
import { PartnerUpdateMeDto } from './dto/partner-update-me.dto.js';

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

@Injectable()
export class PartnerAuthService {
  private readonly saltRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mail: MailService,
  ) {}

  async register(dto: PartnerRegisterDto) {
    const existing = await this.prisma.partner.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);
    const slug = await this.generateUniqueSlug(dto.name);

    const partner = await this.prisma.partner.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        phone: dto.phone,
        document: dto.document,
        slug,
      },
    });

    this.mail
      .sendPartnerPendingApproval(partner.email, partner.name)
      .catch(() => null);

    const token = this.generateToken(partner.id, partner.email);
    return this.formatResponse(partner, token);
  }

  async login(dto: PartnerLoginDto) {
    const partner = await this.prisma.partner.findUnique({
      where: { email: dto.email },
    });

    if (!partner || !partner.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      partner.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const token = this.generateToken(partner.id, partner.email);
    return this.formatResponse(partner, token);
  }

  async forgotPassword(dto: PartnerForgotPasswordDto) {
    const partner = await this.prisma.partner.findUnique({
      where: { email: dto.email },
    });

    if (!partner || !partner.isActive) {
      return { message: 'Se o email existir, você receberá as instruções.' };
    }

    const token = randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 1000 * 60 * 60);

    await this.prisma.partner.update({
      where: { id: partner.id },
      data: { passwordResetToken: token, passwordResetExpiry: expiry },
    });

    const resetUrl = `${process.env['FRONTEND_URL']}/parceiro/reset-password?token=${token}`;
    this.mail
      .sendPartnerForgotPassword(partner.email, partner.name, resetUrl)
      .catch(() => null);

    return { message: 'Se o email existir, você receberá as instruções.' };
  }

  async resetPassword(dto: PartnerResetPasswordDto) {
    const partner = await this.prisma.partner.findFirst({
      where: {
        passwordResetToken: dto.token,
        passwordResetExpiry: { gt: new Date() },
        isActive: true,
      },
    });

    if (!partner) throw new BadRequestException('Token inválido ou expirado');

    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);
    await this.prisma.partner.update({
      where: { id: partner.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    return { message: 'Senha redefinida com sucesso' };
  }

  async me(partnerId: string) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        document: true,
        slug: true,
        commissionPct: true,
        status: true,
        approvedAt: true,
        rejectedReason: true,
        clicks: true,
        createdAt: true,
      },
    });
    return { partner };
  }

  async updateMe(partnerId: string, dto: PartnerUpdateMeDto) {
    const data: {
      name?: string;
      email?: string;
      phone?: string;
      document?: string;
      password?: string;
    } = {};

    if (dto.name) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.document !== undefined) data.document = dto.document;

    if (dto.email) {
      const existing = await this.prisma.partner.findUnique({
        where: { email: dto.email },
      });
      if (existing && existing.id !== partnerId) {
        throw new ConflictException('Email já está em uso');
      }
      data.email = dto.email;
    }

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, this.saltRounds);
    }

    const partner = await this.prisma.partner.update({
      where: { id: partnerId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        document: true,
        slug: true,
      },
    });

    return { partner };
  }

  async validatePartner(partnerId: string) {
    return this.prisma.partner.findUnique({
      where: { id: partnerId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        slug: true,
        status: true,
        commissionPct: true,
      },
    });
  }

  private generateToken(partnerId: string, email: string) {
    return this.jwtService.sign(
      { sub: partnerId, email, type: 'partner' },
      { expiresIn: 60 * 60 * 24 * 7 },
    );
  }

  private formatResponse(
    partner: {
      id: string;
      name: string;
      email: string;
      slug: string;
      status: string;
    },
    token: string,
  ) {
    return {
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        slug: partner.slug,
        status: partner.status,
      },
      accessToken: token,
    };
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'parceiro';
    let candidate = base;
    let suffix = 0;

    // tenta até 10 vezes com sufixo numérico, depois cai pra random
    while (suffix < 10) {
      const existing = await this.prisma.partner.findUnique({
        where: { slug: candidate },
      });
      if (!existing) return candidate;
      suffix += 1;
      candidate = `${base}-${suffix}`;
    }

    return `${base}-${randomBytes(3).toString('hex')}`;
  }
}
