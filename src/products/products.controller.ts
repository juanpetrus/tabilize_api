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
import { ProductsService } from './products.service.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * Listar produtos da empresa (paginado, search por descricao/codigoInterno/codigoBarras)
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
    return this.productsService.findAllByCompany(teamId, companyId, req.user.id, {
      search,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  /**
   * Buscar produto específico (inclui NCM, CFOP, CST, CSOSN)
   */
  @Get(':productId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('productId') productId: string,
    @Req() req: AuthRequest,
  ) {
    return this.productsService.findOne(teamId, companyId, productId, req.user.id);
  }

  /**
   * Criar produto
   */
  @Post()
  create(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Body() dto: CreateProductDto,
    @Req() req: AuthRequest,
  ) {
    return this.productsService.create(teamId, companyId, req.user.id, dto);
  }

  /**
   * Atualizar produto
   */
  @Patch(':productId')
  update(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
    @Req() req: AuthRequest,
  ) {
    return this.productsService.update(
      teamId,
      companyId,
      productId,
      req.user.id,
      dto,
    );
  }

  /**
   * Remover produto (soft delete)
   */
  @Delete(':productId')
  remove(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('productId') productId: string,
    @Req() req: AuthRequest,
  ) {
    return this.productsService.remove(teamId, companyId, productId, req.user.id);
  }
}
