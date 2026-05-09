import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { DismissEmployeeDto } from './dto/dismiss-employee.dto.js';
import { CreatePayslipDto } from './dto/create-payslip.dto.js';
import { GeneratePayslipDto } from './dto/generate-payslip.dto.js';
import { EmployeeStatus, PayslipItemType } from '../../generated/prisma/enums.js';
import { PayslipPdfService } from './payslip-pdf.service.js';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly pdfService: PayslipPdfService,
  ) {}

  // ─── Criar funcionário ───────────────────────────────────────────────────────

  async create(
    teamId: string,
    companyId: string,
    userId: string,
    dto: CreateEmployeeDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    // Verifica se CPF já existe nessa empresa
    const cpfClean = dto.cpf.replace(/\D/g, '');
    const existing = await this.prisma.employee.findUnique({
      where: { companyId_cpf: { companyId, cpf: cpfClean } },
    });
    if (existing) {
      throw new ConflictException('CPF já cadastrado nesta empresa');
    }

    return this.prisma.employee.create({
      data: {
        companyId,
        name: dto.name,
        cpf: cpfClean,
        rg: dto.rg,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        admissionDate: new Date(dto.admissionDate),
        position: dto.position,
        department: dto.department,
        salary: dto.salary,
        workCard: dto.workCard,
        pis: dto.pis,
        contractType: dto.contractType,
        status: dto.status,
        notes: dto.notes,
      },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
      },
    });
  }

  // ─── Listar funcionários de uma empresa ──────────────────────────────────────

  async findAllByCompany(teamId: string, companyId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    return this.prisma.employee.findMany({
      where: { companyId, isActive: true },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        _count: { select: { payslips: true, documents: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Listar todos os funcionários do escritório ──────────────────────────────

  async findAllByTeam(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    return this.prisma.employee.findMany({
      where: {
        isActive: true,
        company: { teamId, isActive: true },
      },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        _count: { select: { payslips: true, documents: true } },
      },
      orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  // ─── Buscar funcionário específico ───────────────────────────────────────────

  async findOne(
    teamId: string,
    companyId: string,
    employeeId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
        documents: { orderBy: { uploadedAt: 'desc' } },
        payslips: {
          orderBy: [{ competenceYear: 'desc' }, { competenceMonth: 'desc' }],
          take: 12,
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    return employee;
  }

  // ─── Atualizar funcionário ───────────────────────────────────────────────────

  async update(
    teamId: string,
    companyId: string,
    employeeId: string,
    userId: string,
    dto: UpdateEmployeeDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    // Se está atualizando CPF, verifica se já existe
    if (dto.cpf) {
      const cpfClean = dto.cpf.replace(/\D/g, '');
      if (cpfClean !== employee.cpf) {
        const existing = await this.prisma.employee.findUnique({
          where: { companyId_cpf: { companyId, cpf: cpfClean } },
        });
        if (existing) {
          throw new ConflictException('CPF já cadastrado nesta empresa');
        }
      }
    }

    return this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        name: dto.name,
        cpf: dto.cpf?.replace(/\D/g, ''),
        rg: dto.rg,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        admissionDate: dto.admissionDate
          ? new Date(dto.admissionDate)
          : undefined,
        position: dto.position,
        department: dto.department,
        salary: dto.salary,
        workCard: dto.workCard,
        pis: dto.pis,
        contractType: dto.contractType,
        status: dto.status,
        notes: dto.notes,
      },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
      },
    });
  }

  // ─── Demitir funcionário ─────────────────────────────────────────────────────

  async dismiss(
    teamId: string,
    companyId: string,
    employeeId: string,
    userId: string,
    dto: DismissEmployeeDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    if (employee.status === EmployeeStatus.DISMISSED) {
      throw new ConflictException('Funcionário já foi demitido');
    }

    return this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        status: EmployeeStatus.DISMISSED,
        dismissalDate: new Date(dto.dismissalDate),
        dismissalType: dto.dismissalType,
        notes: dto.notes
          ? `${employee.notes || ''}\n\nDemissão: ${dto.notes}`.trim()
          : employee.notes,
      },
      include: {
        company: { select: { id: true, name: true, cnpj: true } },
      },
    });
  }

  // ─── Remover funcionário (soft delete) ───────────────────────────────────────

  async remove(
    teamId: string,
    companyId: string,
    employeeId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    return this.prisma.employee.update({
      where: { id: employeeId },
      data: { isActive: false },
    });
  }

  // ─── Upload de documento do funcionário ──────────────────────────────────────

  async uploadDocument(
    teamId: string,
    companyId: string,
    employeeId: string,
    userId: string,
    file: Express.Multer.File,
    documentName: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    const fileUrl = await this.storage.upload(
      file,
      `employees/${companyId}/${employeeId}`,
    );

    return this.prisma.employeeDocument.create({
      data: {
        employeeId,
        name: documentName,
        fileUrl,
        fileName: file.originalname,
        mimeType: file.mimetype,
      },
    });
  }

  // ─── Upload de holerite ─────────────────────────────────────────────────────

  async uploadPayslip(
    teamId: string,
    companyId: string,
    employeeId: string,
    userId: string,
    file: Express.Multer.File,
    dto: CreatePayslipDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    // Verifica se já existe holerite para esse mês/ano
    const existing = await this.prisma.payslip.findFirst({
      where: {
        employeeId,
        competenceMonth: dto.competenceMonth,
        competenceYear: dto.competenceYear,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Já existe holerite para ${dto.competenceMonth}/${dto.competenceYear}`,
      );
    }

    const fileUrl = await this.storage.upload(
      file,
      `payslips/${companyId}/${employeeId}`,
    );

    return this.prisma.payslip.create({
      data: {
        employeeId,
        competenceMonth: dto.competenceMonth,
        competenceYear: dto.competenceYear,
        grossSalary: dto.grossSalary,
        netSalary: dto.netSalary,
        deductions: dto.deductions,
        fileUrl,
        fileName: file.originalname,
      },
    });
  }

  // ─── Resumo para dashboard ───────────────────────────────────────────────────

  async getSummary(teamId: string, userId: string) {
    await this.ensureTeamMember(teamId, userId);

    const [total, active, dismissed, onLeave] = await Promise.all([
      this.prisma.employee.count({
        where: { isActive: true, company: { teamId, isActive: true } },
      }),
      this.prisma.employee.count({
        where: {
          isActive: true,
          status: EmployeeStatus.ACTIVE,
          company: { teamId, isActive: true },
        },
      }),
      this.prisma.employee.count({
        where: {
          isActive: true,
          status: EmployeeStatus.DISMISSED,
          company: { teamId, isActive: true },
        },
      }),
      this.prisma.employee.count({
        where: {
          isActive: true,
          status: { in: [EmployeeStatus.ON_LEAVE, EmployeeStatus.VACATION] },
          company: { teamId, isActive: true },
        },
      }),
    ]);

    return { total, active, dismissed, onLeave };
  }

  // ─── Gerar holerite (PDF) ───────────────────────────────────────────────────

  async generatePayslip(
    teamId: string,
    companyId: string,
    employeeId: string,
    userId: string,
    dto: GeneratePayslipDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
      include: {
        company: { select: { id: true, name: true, cnpj: true, address: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    // Verifica se já existe holerite para esse mês/ano
    const existing = await this.prisma.payslip.findFirst({
      where: {
        employeeId,
        competenceMonth: dto.competenceMonth,
        competenceYear: dto.competenceYear,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Já existe holerite para ${dto.competenceMonth}/${dto.competenceYear}`,
      );
    }

    // Calcular totais
    const earnings = dto.items.filter((i) => i.type === 'EARNING');
    const deductions = dto.items.filter((i) => i.type === 'DEDUCTION');
    const grossSalary = earnings.reduce((sum, i) => sum + i.value, 0);
    const totalDeductions = deductions.reduce((sum, i) => sum + i.value, 0);
    const netSalary = grossSalary - totalDeductions;

    // Gerar PDF
    const pdfBuffer = await this.pdfService.generate({
      companyName: employee.company?.name || 'Empresa',
      companyCnpj: employee.company?.cnpj || '',
      companyAddress: employee.company?.address || undefined,
      employeeName: employee.name,
      employeeCpf: employee.cpf,
      employeePosition: employee.position,
      employeeDepartment: employee.department || undefined,
      employeeAdmissionDate: employee.admissionDate,
      employeeWorkCard: employee.workCard || undefined,
      competenceMonth: dto.competenceMonth,
      competenceYear: dto.competenceYear,
      items: dto.items.map((i) => ({
        code: i.code,
        description: i.description,
        type: i.type,
        reference: i.reference,
        value: i.value,
      })),
      baseInss: dto.baseInss,
      baseIrrf: dto.baseIrrf,
      fgtsValue: dto.fgtsValue,
    });

    // Upload do PDF
    const fileName = `holerite_${employee.name.replace(/\s+/g, '_')}_${String(dto.competenceMonth).padStart(2, '0')}_${dto.competenceYear}.pdf`;
    const file = {
      buffer: pdfBuffer,
      originalname: fileName,
      mimetype: 'application/pdf',
    } as Express.Multer.File;

    const fileUrl = await this.storage.upload(
      file,
      `payslips/${companyId}/${employeeId}`,
    );

    // Criar registro do payslip com items
    const payslip = await this.prisma.payslip.create({
      data: {
        employeeId,
        competenceMonth: dto.competenceMonth,
        competenceYear: dto.competenceYear,
        grossSalary,
        netSalary,
        deductions: totalDeductions,
        baseInss: dto.baseInss,
        baseIrrf: dto.baseIrrf,
        fgtsValue: dto.fgtsValue,
        fileUrl,
        fileName,
        items: {
          create: dto.items.map((item) => ({
            code: item.code,
            description: item.description,
            type: item.type === 'EARNING' ? PayslipItemType.EARNING : PayslipItemType.DEDUCTION,
            reference: item.reference,
            value: item.value,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    return payslip;
  }

  // ─── Portal cliente ──────────────────────────────────────────────────────────

  async findAllForClient(companyId: string, companyUserId: string) {
    // Verifica se o usuário tem acesso à empresa
    const access = await this.prisma.companyUserCompany.findFirst({
      where: {
        companyUserId,
        companyId,
      },
    });

    if (!access) {
      throw new ForbiddenException('Acesso negado a esta empresa');
    }

    return this.prisma.employee.findMany({
      where: { companyId, isActive: true, status: EmployeeStatus.ACTIVE },
      select: {
        id: true,
        name: true,
        position: true,
        department: true,
        admissionDate: true,
        status: true,
        contractType: true,
        // Omite dados sensíveis: cpf, rg, salary, pis, etc
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneForClient(
    companyId: string,
    companyUserId: string,
    employeeId: string,
  ) {
    // Verifica se o usuário tem acesso à empresa
    const access = await this.prisma.companyUserCompany.findFirst({
      where: {
        companyUserId,
        companyId,
      },
    });

    if (!access) {
      throw new ForbiddenException('Acesso negado a esta empresa');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
      select: {
        id: true,
        name: true,
        position: true,
        department: true,
        admissionDate: true,
        status: true,
        contractType: true,
        payslips: {
          select: {
            id: true,
            competenceMonth: true,
            competenceYear: true,
            grossSalary: true,
            netSalary: true,
            deductions: true,
            fileName: true,
            createdAt: true,
          },
          orderBy: [{ competenceYear: 'desc' }, { competenceMonth: 'desc' }],
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    return employee;
  }

  async getPayslipForClient(
    companyId: string,
    companyUserId: string,
    employeeId: string,
    payslipId: string,
  ) {
    // Verifica se o usuário tem acesso à empresa
    const access = await this.prisma.companyUserCompany.findFirst({
      where: {
        companyUserId,
        companyId,
      },
    });

    if (!access) {
      throw new ForbiddenException('Acesso negado a esta empresa');
    }

    // Verifica se o funcionário pertence à empresa
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, isActive: true },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado');
    }

    // Busca o holerite
    const payslip = await this.prisma.payslip.findFirst({
      where: { id: payslipId, employeeId },
    });

    if (!payslip) {
      throw new NotFoundException('Holerite não encontrado');
    }

    return payslip;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });

    if (!member) {
      throw new ForbiddenException('Você não é membro dessa equipe');
    }

    return member;
  }

  private async ensureCompanyBelongsToTeam(teamId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    return company;
  }
}
