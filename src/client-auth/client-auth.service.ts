import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
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

    // Cria usuário e associação com empresa em uma transação
    const companyUser = await this.prisma.$transaction(async (tx) => {
      const user = await tx.companyUser.create({
        data: {
          companyId: company.id,
          activeCompanyId: company.id,
          name: dto.name,
          email: dto.email,
          password: hashedPassword,
        },
      });

      // Cria associação many-to-many
      await tx.companyUserCompany.create({
        data: {
          companyUserId: user.id,
          companyId: company.id,
          isDefault: true,
        },
      });

      return user;
    });

    const token = this.generateToken(
      companyUser.id,
      companyUser.email,
      company.id,
    );
    return this.formatResponse(companyUser, token);
  }

  async login(dto: ClientLoginDto) {
    const companyUser = await this.prisma.companyUser.findUnique({
      where: { email: dto.email },
      include: {
        company: { select: { id: true, name: true, isActive: true } },
        companies: {
          include: {
            company: {
              select: { id: true, name: true, cnpj: true, isActive: true },
            },
          },
        },
      },
    });

    if (
      !companyUser ||
      !companyUser.isActive ||
      !companyUser.company.isActive
    ) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      companyUser.password,
    );

    if (!isPasswordValid)
      throw new UnauthorizedException('Credenciais inválidas');

    // Usa empresa ativa ou a padrão
    const activeCompanyId =
      companyUser.activeCompanyId || companyUser.companyId;

    const token = this.generateToken(
      companyUser.id,
      companyUser.email,
      activeCompanyId,
    );
    return this.formatResponseWithCompanies(
      companyUser,
      token,
      activeCompanyId,
    );
  }

  async validateCompanyUser(companyUserId: string) {
    return this.prisma.companyUser.findUnique({
      where: { id: companyUserId, isActive: true },
      include: { company: { select: { id: true, name: true, teamId: true } } },
    });
  }

  /**
   * Lista todas as empresas que o usuário tem acesso
   */
  async listCompanies(companyUserId: string) {
    const links = await this.prisma.companyUserCompany.findMany({
      where: { companyUserId },
      include: {
        company: {
          select: { id: true, name: true, cnpj: true, isActive: true },
        },
      },
      orderBy: { isDefault: 'desc' },
    });

    const user = await this.prisma.companyUser.findUnique({
      where: { id: companyUserId },
      select: { activeCompanyId: true, companyId: true },
    });

    const activeCompanyId = user?.activeCompanyId || user?.companyId;

    return links
      .filter((link) => link.company.isActive)
      .map((link) => ({
        id: link.company.id,
        name: link.company.name,
        cnpj: link.company.cnpj,
        isDefault: link.isDefault,
        isActive: link.company.id === activeCompanyId,
      }));
  }

  /**
   * Troca a empresa ativa do usuário
   */
  async switchCompany(companyUserId: string, companyId: string) {
    // Verifica se usuário tem acesso à empresa
    const link = await this.prisma.companyUserCompany.findUnique({
      where: {
        companyUserId_companyId: { companyUserId, companyId },
      },
      include: {
        company: { select: { id: true, name: true, isActive: true } },
      },
    });

    if (!link || !link.company.isActive) {
      throw new ForbiddenException('Você não tem acesso a esta empresa');
    }

    // Atualiza empresa ativa
    const companyUser = await this.prisma.companyUser.update({
      where: { id: companyUserId },
      data: { activeCompanyId: companyId },
      include: {
        companies: {
          include: {
            company: {
              select: { id: true, name: true, cnpj: true, isActive: true },
            },
          },
        },
      },
    });

    // Gera novo token com a empresa ativa
    const token = this.generateToken(
      companyUser.id,
      companyUser.email,
      companyId,
    );

    return {
      companyUser: {
        id: companyUser.id,
        name: companyUser.name,
        email: companyUser.email,
        companyId: companyId,
      },
      activeCompany: {
        id: link.company.id,
        name: link.company.name,
      },
      accessToken: token,
    };
  }

  /**
   * Adiciona acesso de um usuário a uma empresa adicional
   */
  async addCompanyAccess(companyUserId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
    });

    if (!company) throw new NotFoundException('Empresa não encontrada');

    const existing = await this.prisma.companyUserCompany.findUnique({
      where: {
        companyUserId_companyId: { companyUserId, companyId },
      },
    });

    if (existing)
      throw new ConflictException('Usuário já tem acesso a esta empresa');

    return this.prisma.companyUserCompany.create({
      data: {
        companyUserId,
        companyId,
        isDefault: false,
      },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
      },
    });
  }

  private generateToken(
    companyUserId: string,
    email: string,
    companyId: string,
  ) {
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

  private formatResponseWithCompanies(
    companyUser: {
      id: string;
      name: string;
      email: string;
      companyId: string;
      companies: Array<{
        isDefault: boolean;
        company: {
          id: string;
          name: string;
          cnpj: string | null;
          isActive: boolean;
        };
      }>;
    },
    token: string,
    activeCompanyId: string,
  ) {
    const companies = companyUser.companies
      .filter((c) => c.company.isActive)
      .map((c) => ({
        id: c.company.id,
        name: c.company.name,
        cnpj: c.company.cnpj,
        isDefault: c.isDefault,
        isActive: c.company.id === activeCompanyId,
      }));

    return {
      companyUser: {
        id: companyUser.id,
        name: companyUser.name,
        email: companyUser.email,
        companyId: activeCompanyId,
      },
      companies,
      accessToken: token,
    };
  }
}
