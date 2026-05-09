import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { EmployeesService } from './employees.service.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { DismissEmployeeDto } from './dto/dismiss-employee.dto.js';
import { CreatePayslipDto } from './dto/create-payslip.dto.js';
import { GeneratePayslipDto } from './dto/generate-payslip.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { ClientJwtGuard } from '../client-auth/guards/client-jwt.guard.js';

interface AuthRequest {
  user: { id: string };
}

interface ClientAuthRequest {
  user: { id: string; companyId: string };
}

// ─── Rotas do Staff (Contador) ───────────────────────────────────────────────

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  /**
   * Listar todos os funcionários do escritório
   */
  @Get()
  findAllByTeam(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.employeesService.findAllByTeam(teamId, req.user.id);
  }

  /**
   * Resumo para dashboard (total, ativos, demitidos, afastados)
   */
  @Get('summary')
  getSummary(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.employeesService.getSummary(teamId, req.user.id);
  }

  /**
   * Listar funcionários de uma empresa específica
   */
  @Get('company/:companyId')
  findAllByCompany(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.employeesService.findAllByCompany(
      teamId,
      companyId,
      req.user.id,
    );
  }

  /**
   * Criar funcionário
   */
  @Post('company/:companyId')
  create(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateEmployeeDto,
  ) {
    return this.employeesService.create(teamId, companyId, req.user.id, dto);
  }

  /**
   * Buscar funcionário específico
   */
  @Get('company/:companyId/:employeeId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.employeesService.findOne(
      teamId,
      companyId,
      employeeId,
      req.user.id,
    );
  }

  /**
   * Atualizar funcionário
   */
  @Patch('company/:companyId/:employeeId')
  update(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employeesService.update(
      teamId,
      companyId,
      employeeId,
      req.user.id,
      dto,
    );
  }

  /**
   * Demitir funcionário
   */
  @Post('company/:companyId/:employeeId/dismiss')
  dismiss(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
    @Req() req: AuthRequest,
    @Body() dto: DismissEmployeeDto,
  ) {
    return this.employeesService.dismiss(
      teamId,
      companyId,
      employeeId,
      req.user.id,
      dto,
    );
  }

  /**
   * Upload de documento do funcionário
   */
  @Post('company/:companyId/:employeeId/documents')
  @UseInterceptors(FileInterceptor('file'))
  uploadDocument(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
    @Query('name') documentName: string,
  ) {
    return this.employeesService.uploadDocument(
      teamId,
      companyId,
      employeeId,
      req.user.id,
      file,
      documentName || file.originalname,
    );
  }

  /**
   * Upload de holerite
   */
  @Post('company/:companyId/:employeeId/payslips')
  @UseInterceptors(FileInterceptor('file'))
  uploadPayslip(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreatePayslipDto,
  ) {
    return this.employeesService.uploadPayslip(
      teamId,
      companyId,
      employeeId,
      req.user.id,
      file,
      dto,
    );
  }

  /**
   * Gerar holerite (PDF)
   */
  @Post('company/:companyId/:employeeId/payslips/generate')
  generatePayslip(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
    @Req() req: AuthRequest,
    @Body() dto: GeneratePayslipDto,
  ) {
    return this.employeesService.generatePayslip(
      teamId,
      companyId,
      employeeId,
      req.user.id,
      dto,
    );
  }

  /**
   * Remover funcionário (soft delete)
   */
  @Delete('company/:companyId/:employeeId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.employeesService.remove(
      teamId,
      companyId,
      employeeId,
      req.user.id,
    );
  }
}

// ─── Rotas do Portal Cliente ─────────────────────────────────────────────────

@UseGuards(ClientJwtGuard)
@Controller('client/employees')
export class ClientEmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  /**
   * Listar funcionários da empresa do cliente
   */
  @Get()
  findAll(@Req() req: ClientAuthRequest) {
    return this.employeesService.findAllForClient(
      req.user.companyId,
      req.user.id,
    );
  }

  /**
   * Detalhe do funcionário com holerites
   */
  @Get(':employeeId')
  findOne(
    @Param('employeeId') employeeId: string,
    @Req() req: ClientAuthRequest,
  ) {
    return this.employeesService.findOneForClient(
      req.user.companyId,
      req.user.id,
      employeeId,
    );
  }

  /**
   * Obter URL de download do holerite
   */
  @Get(':employeeId/payslips/:payslipId/download')
  async getPayslipDownload(
    @Param('employeeId') employeeId: string,
    @Param('payslipId') payslipId: string,
    @Req() req: ClientAuthRequest,
  ) {
    const payslip = await this.employeesService.getPayslipForClient(
      req.user.companyId,
      req.user.id,
      employeeId,
      payslipId,
    );
    return { url: payslip.fileUrl, fileName: payslip.fileName };
  }
}
