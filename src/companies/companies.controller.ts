import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
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
  findAll(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.companiesService.findAll(teamId, req.user.id);
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
}
