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
  UseGuards,
} from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  /**
   * Listar clientes da empresa (paginado, search por name/cpfCnpj)
   */
  @Get()
  findAllByCompany(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: AuthRequest,
  ) {
    return this.customersService.findAllByCompany(teamId, companyId, req.user.id, {
      search,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  /**
   * Buscar cliente específico
   */
  @Get(':customerId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('customerId') customerId: string,
    @Req() req: AuthRequest,
  ) {
    return this.customersService.findOne(teamId, companyId, customerId, req.user.id);
  }

  /**
   * Criar cliente
   */
  @Post()
  create(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Body() dto: CreateCustomerDto,
    @Req() req: AuthRequest,
  ) {
    return this.customersService.create(teamId, companyId, req.user.id, dto);
  }

  /**
   * Atualizar cliente
   */
  @Patch(':customerId')
  update(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: AuthRequest,
  ) {
    return this.customersService.update(
      teamId,
      companyId,
      customerId,
      req.user.id,
      dto,
    );
  }

  /**
   * Remover cliente (soft delete)
   */
  @Delete(':customerId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('customerId') customerId: string,
    @Req() req: AuthRequest,
  ) {
    return this.customersService.remove(teamId, companyId, customerId, req.user.id);
  }
}
