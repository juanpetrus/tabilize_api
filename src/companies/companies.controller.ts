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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CompaniesService } from './companies.service.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  create(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.companiesService.create(teamId, req.user.id, dto);
  }

  @Get()
  findAll(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.companiesService.findAll(teamId, req.user.id, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  /**
   * Lista todos os usuários do portal do escritório.
   * Declarado antes de `:companyId` para não ser capturado pela rota dinâmica.
   */
  @Get('portal-users')
  listAllPortalUsers(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.companiesService.listAllPortalUsers(teamId, req.user.id);
  }

  @Get(':companyId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.companiesService.findOne(teamId, companyId, req.user.id);
  }

  @Patch(':companyId')
  update(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(teamId, companyId, req.user.id, dto);
  }

  @Delete(':companyId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.companiesService.remove(teamId, companyId, req.user.id);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.companiesService.importCsv(teamId, req.user.id, file.buffer);
  }

  // ─── Gerenciamento de acessos de usuários do portal ───────────────────────

  /**
   * Lista usuários do portal com acesso a uma empresa específica
   */
  @Get(':companyId/users')
  listCompanyUsers(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.companiesService.listCompanyUsers(
      teamId,
      companyId,
      req.user.id,
    );
  }

  /**
   * Adiciona acesso de um usuário do portal a uma empresa
   */
  @Post(':companyId/users/:companyUserId')
  addUserToCompany(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('companyUserId') companyUserId: string,
    @Req() req: AuthRequest,
  ) {
    return this.companiesService.addUserToCompany(
      teamId,
      companyId,
      req.user.id,
      companyUserId,
    );
  }

  /**
   * Remove acesso de um usuário do portal a uma empresa
   */
  @Delete(':companyId/users/:companyUserId')
  removeUserFromCompany(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('companyUserId') companyUserId: string,
    @Req() req: AuthRequest,
  ) {
    return this.companiesService.removeUserFromCompany(
      teamId,
      companyId,
      req.user.id,
      companyUserId,
    );
  }
}
