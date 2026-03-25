import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { BillingCycle } from 'generated/prisma/enums';

@Injectable()
export class AuthService {
  private readonly saltRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email já cadastrado');
    }

    const hashedPassword = await bcrypt.hash(dto.password, this.saltRounds);

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          password: hashedPassword,
        },
      });

      const trialExpiry = new Date();
      trialExpiry.setDate(trialExpiry.getDate() + 7);

      await tx.team.create({
        data: {
          name: dto.teamName,
          ownerId: newUser.id,
          planId: dto.planId,
          subscriptionStatus: 'TRIAL',
          subscriptionExpiry: trialExpiry,
          billingCycle: dto.billingCycle as BillingCycle,
          members: {
            create: { userId: newUser.id, role: 'OWNER' },
          },
        },
      });

      return newUser;
    });

    const token = this.generateToken(user.id, user.email);
    return this.formatAuthResponse(user, token);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const token = this.generateToken(user.id, user.email);
    return this.formatAuthResponse(user, token);
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const data: { name?: string; email?: string; password?: string } = {};

    if (dto.name) data.name = dto.name;

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Email já está em uso');
      }
      data.email = dto.email;
    }

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, this.saltRounds);
    }

    const user = await this.prisma.user.update({ where: { id: userId }, data });
    return { user: { id: user.id, name: user.name, email: user.email } };
  }

  async deleteUser(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
    return { message: 'Conta desativada com sucesso' };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        teamMembers: {
          where: { isActive: true },
          select: {
            role: true,
            team: {
              select: {
                id: true,
                name: true,
                planId: true,
                subscriptionStatus: true,
                subscriptionExpiry: true,
              },
            },
          },
        },
      },
    });

    const teams = user?.teamMembers.map(({ role, team }) => {
      const expiry = team.subscriptionExpiry;
      const trialDaysLeft =
        team.subscriptionStatus === 'TRIAL' && expiry
          ? Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : null;

      return { role, ...team, trialDaysLeft };
    });

    return { user: { ...user, teamMembers: teams } };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId, isActive: true },
    });
  }

  private generateToken(userId: string, email: string) {
    return this.jwtService.sign(
      { sub: userId, email },
      { expiresIn: 60 * 60 * 24 * 7 }, // 7 dias em segundos
    );
  }

  private formatAuthResponse(user: { id: string; name: string; email: string }, token: string) {
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      accessToken: token,
    };
  }
}
