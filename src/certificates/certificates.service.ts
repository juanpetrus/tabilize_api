import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import * as forge from 'node-forge';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env['CERTIFICATE_ENCRYPTION_KEY'] ?? '', 'hex');

// Janela (em dias) para considerar um certificado "vencendo em breve"
const EXPIRING_SOON_DAYS = 30;

export type CertificateStatus =
  | 'missing'
  | 'expired'
  | 'expiring_soon'
  | 'valid'
  | 'unknown';

export type CertificateStatusFilter =
  | 'with'
  | 'without'
  | 'expired'
  | 'expiring_soon'
  | 'valid';

@Injectable()
export class CertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upsert(
    teamId: string,
    companyId: string,
    userId: string,
    file: Express.Multer.File,
    password: string,
    expiresAt?: string,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const existing = await this.prisma.companyCertificate.findUnique({
      where: { companyId },
    });

    // Remove certificado antigo do R2 se existir
    if (existing) {
      await this.storage.delete(existing.certUrl).catch(() => null);
    }

    const certUrl = await this.storage.upload(
      file,
      `teams/${teamId}/companies/${companyId}/certificates`,
    );

    const encryptedPassword = this.encrypt(password);

    // Salva primeiro para ter o companyId disponível no parseCertificate
    await this.prisma.companyCertificate.upsert({
      where: { companyId },
      create: {
        companyId,
        certUrl,
        password: encryptedPassword,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      update: {
        certUrl,
        password: encryptedPassword,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
      },
    });

    // Valida e extrai informações do certificado (atualiza expiresAt automaticamente)
    return this.parseCertificate(file.buffer, password, companyId);
  }

  /**
   * Visão geral de certificados da equipe (paginada): lista as empresas e
   * indica se possuem certificado e o status (válido / vencendo / vencido / sem).
   * Usada na tela de gestão de certificados.
   *
   * `counts` reflete TODAS as empresas que batem com `search` (ignora `status`),
   * para montar os filtros com contagem. `pagination.total` é o total já
   * filtrado por `search` + `status`.
   */
  async listForTeam(
    teamId: string,
    userId: string,
    options: {
      search?: string;
      status?: CertificateStatusFilter;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    await this.ensureTeamMember(teamId, userId);

    const search = options.search?.trim();
    const page =
      Number.isFinite(options.page) && (options.page as number) > 0
        ? Math.trunc(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
        ? Math.min(100, Math.trunc(options.pageSize as number))
        : 20;

    const now = new Date();
    const soonThreshold = new Date(
      now.getTime() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000,
    );

    const baseWhere: Prisma.CompanyWhereInput = {
      teamId,
      isActive: true,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { cnpj: { contains: search } },
            ],
          }
        : {}),
    };

    const statusWhere = (
      status?: CertificateStatusFilter,
    ): Prisma.CompanyWhereInput => {
      switch (status) {
        case 'with':
          return { certificate: { isNot: null } };
        case 'without':
          return { certificate: { is: null } };
        case 'expired':
          return { certificate: { expiresAt: { lt: now } } };
        case 'expiring_soon':
          return { certificate: { expiresAt: { gte: now, lt: soonThreshold } } };
        case 'valid':
          return { certificate: { expiresAt: { gte: soonThreshold } } };
        default:
          return {};
      }
    };

    const where: Prisma.CompanyWhereInput = {
      AND: [baseWhere, statusWhere(options.status)],
    };

    const [
      total,
      grandTotal,
      withCertificate,
      expired,
      expiringSoon,
      valid,
      rows,
    ] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.count({ where: baseWhere }),
      this.prisma.company.count({
        where: { AND: [baseWhere, statusWhere('with')] },
      }),
      this.prisma.company.count({
        where: { AND: [baseWhere, statusWhere('expired')] },
      }),
      this.prisma.company.count({
        where: { AND: [baseWhere, statusWhere('expiring_soon')] },
      }),
      this.prisma.company.count({
        where: { AND: [baseWhere, statusWhere('valid')] },
      }),
      this.prisma.company.findMany({
        where,
        select: {
          id: true,
          name: true,
          cnpj: true,
          certificate: {
            select: {
              id: true,
              expiresAt: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const items = rows.map((c) => {
      const cert = c.certificate;
      let status: CertificateStatus;
      if (!cert) status = 'missing';
      else if (!cert.expiresAt) status = 'unknown';
      else if (cert.expiresAt < now) status = 'expired';
      else if (cert.expiresAt < soonThreshold) status = 'expiring_soon';
      else status = 'valid';

      return {
        companyId: c.id,
        companyName: c.name,
        cnpj: c.cnpj,
        hasCertificate: !!cert,
        status,
        certificate: cert
          ? {
              id: cert.id,
              expiresAt: cert.expiresAt,
              isActive: cert.isActive,
              createdAt: cert.createdAt,
              updatedAt: cert.updatedAt,
            }
          : null,
      };
    });

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
      counts: {
        total: grandTotal,
        withCertificate,
        withoutCertificate: grandTotal - withCertificate,
        valid,
        expiringSoon,
        expired,
        unknown: withCertificate - valid - expiringSoon - expired,
      },
    };
  }

  async findOne(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const cert = await this.prisma.companyCertificate.findUnique({
      where: { companyId },
      select: {
        id: true,
        companyId: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!cert) throw new NotFoundException('Certificado não encontrado');

    return cert;
  }

  async remove(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const cert = await this.prisma.companyCertificate.findUnique({
      where: { companyId },
    });

    if (!cert) throw new NotFoundException('Certificado não encontrado');

    await this.storage.delete(cert.certUrl).catch(() => null);

    return this.prisma.companyCertificate.delete({ where: { companyId } });
  }

  async validate(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const cert = await this.prisma.companyCertificate.findUnique({
      where: { companyId },
    });

    if (!cert) throw new NotFoundException('Certificado não encontrado');

    const fileBuffer = await this.storage.download(cert.certUrl);
    const password = this.decrypt(cert.password);

    return this.parseCertificate(fileBuffer, password, companyId);
  }

  // Uso interno — retorna certificado + senha descriptografada para integração SEFAZ
  async getForIntegration(companyId: string) {
    const cert = await this.prisma.companyCertificate.findUnique({
      where: { companyId, isActive: true },
    });

    if (!cert) throw new NotFoundException('Certificado não encontrado');

    if (cert.expiresAt && cert.expiresAt < new Date()) {
      throw new BadRequestException('Certificado expirado');
    }

    const fileBuffer = await this.storage.download(cert.certUrl);
    const password = this.decrypt(cert.password);

    return { fileBuffer, password };
  }

  private async parseCertificate(
    fileBuffer: Buffer,
    password: string,
    companyId: string,
  ) {
    let p12Asn1: forge.asn1.Asn1;
    try {
      p12Asn1 = forge.asn1.fromDer(fileBuffer.toString('binary'));
    } catch {
      throw new BadRequestException(
        'Arquivo de certificado inválido ou corrompido',
      );
    }

    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
    } catch {
      throw new BadRequestException('Senha do certificado incorreta');
    }

    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
    const certBag = certBags[forge.pki.oids.certBag]?.[0];
    const x509 = certBag?.cert;

    if (!x509)
      throw new BadRequestException(
        'Certificado não encontrado no arquivo .pfx',
      );

    const validFrom = x509.validity.notBefore;
    const validTo = x509.validity.notAfter;
    const isValid = new Date() < validTo;

    // Atualiza expiresAt no banco automaticamente
    await this.prisma.companyCertificate.update({
      where: { companyId },
      data: { expiresAt: validTo },
    });

    return {
      isValid,
      validFrom,
      validTo,
      subject: {
        name: x509.subject.getField('CN')?.value ?? null,
        organization: x509.subject.getField('O')?.value ?? null,
      },
      issuer: {
        name: x509.issuer.getField('CN')?.value ?? null,
        organization: x509.issuer.getField('O')?.value ?? null,
      },
    };
  }

  private encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(text: string): string {
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  }

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
  }

  private async ensureAccess(
    teamId: string,
    companyId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
  }
}
