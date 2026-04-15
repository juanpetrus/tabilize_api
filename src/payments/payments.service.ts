import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto.js';
import { PaymentStatus, RecurrenceInterval } from '../../generated/prisma/enums.js';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(teamId: string, companyId: string, userId: string, dto: CreatePaymentDto) {
    await this.ensureAccess(teamId, companyId, userId);

    if (!dto.isRecurring || !dto.recurrenceInterval || !dto.recurrenceEndDate) {
      return this.prisma.payment.create({
        data: {
          companyId,
          description: dto.description,
          amount: dto.amount,
          dueDate: new Date(dto.dueDate),
          referenceMonth: dto.referenceMonth,
        },
      });
    }

    const recurrenceGroupId = randomUUID();
    const dates = this.generateDates(
      new Date(dto.dueDate),
      new Date(dto.recurrenceEndDate),
      dto.recurrenceInterval,
    );

    await this.prisma.payment.createMany({
      data: dates.map((dueDate, index) => ({
        companyId,
        description: dto.description,
        amount: dto.amount,
        dueDate,
        referenceMonth: this.toReferenceMonth(dueDate),
        isRecurring: true,
        recurrenceInterval: dto.recurrenceInterval,
        recurrenceEndDate: new Date(dto.recurrenceEndDate!),
        recurrenceGroupId,
      })),
    });

    return this.prisma.payment.findMany({
      where: { recurrenceGroupId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findAllByCompany(teamId: string, companyId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    return this.prisma.payment.findMany({
      where: { companyId, isActive: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findAllByTeam(teamId: string, userId: string) {
    await this.ensureMember(teamId, userId);

    return this.prisma.payment.findMany({
      where: { company: { teamId }, isActive: true },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findAllForClient(companyId: string, companyUserId: string) {
    await this.ensureCompanyUser(companyId, companyUserId);

    return this.prisma.payment.findMany({
      where: { companyId, isActive: true },
      orderBy: { dueDate: 'asc' },
    });
  }

  async updateStatus(
    teamId: string,
    companyId: string,
    paymentId: string,
    userId: string,
    dto: UpdatePaymentStatusDto,
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, companyId, isActive: true },
    });

    if (!payment) throw new NotFoundException('Cobrança não encontrada');

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: dto.status,
        paidAt: dto.status === PaymentStatus.PAID
          ? (dto.paidAt ? new Date(dto.paidAt) : new Date())
          : null,
      },
    });
  }

  async update(
    teamId: string,
    companyId: string,
    paymentId: string,
    userId: string,
    dto: { description?: string; amount?: number; dueDate?: string; referenceMonth?: string | null },
  ) {
    await this.ensureAccess(teamId, companyId, userId);

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, companyId, isActive: true },
    });
    if (!payment) throw new NotFoundException('Cobrança não encontrada');

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.referenceMonth !== undefined && { referenceMonth: dto.referenceMonth }),
      },
    });
  }

  async remove(teamId: string, companyId: string, paymentId: string, userId: string) {
    await this.ensureAccess(teamId, companyId, userId);

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, companyId, isActive: true },
    });

    if (!payment) throw new NotFoundException('Cobrança não encontrada');

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: { isActive: false },
    });
  }

  private generateDates(start: Date, end: Date, interval: RecurrenceInterval): Date[] {
    const dates: Date[] = [];
    const current = new Date(start);

    while (current <= end) {
      dates.push(new Date(current));

      if (interval === RecurrenceInterval.MONTHLY) current.setMonth(current.getMonth() + 1);
      else if (interval === RecurrenceInterval.QUARTERLY) current.setMonth(current.getMonth() + 3);
      else if (interval === RecurrenceInterval.YEARLY) current.setFullYear(current.getFullYear() + 1);
    }

    return dates;
  }

  private toReferenceMonth(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

  private async ensureMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
  }

  private async ensureCompanyUser(companyId: string, companyUserId: string) {
    const companyUser = await this.prisma.companyUser.findFirst({
      where: { id: companyUserId, companyId, isActive: true },
    });
    if (!companyUser) throw new ForbiddenException('Acesso negado');
  }
}
