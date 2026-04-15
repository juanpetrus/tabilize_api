import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import * as forge from 'node-forge';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';

const ALGORITHM = 'aes-256-cbc';
const KEY = Buffer.from(process.env['CERTIFICATE_ENCRYPTION_KEY'] ?? '', 'hex');

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

  private async parseCertificate(fileBuffer: Buffer, password: string, companyId: string) {
    let p12Asn1: forge.asn1.Asn1;
    try {
      p12Asn1 = forge.asn1.fromDer(fileBuffer.toString('binary'));
    } catch {
      throw new BadRequestException('Arquivo de certificado inválido ou corrompido');
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

    if (!x509) throw new BadRequestException('Certificado não encontrado no arquivo .pfx');

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
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(text: string): string {
    const [ivHex, encryptedHex] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = createDecipheriv(ALGORITHM, KEY, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  private async ensureAccess(teamId: string, companyId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
  }
}
