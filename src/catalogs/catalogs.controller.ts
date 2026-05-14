import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CatalogsService } from './catalogs.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

@UseGuards(JwtAuthGuard)
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  /**
   * GET /catalogs/cnae?q=&secao=&page=&pageSize=
   */
  @Get('cnae')
  searchCnae(
    @Query('q') q?: string,
    @Query('secao') secao?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.catalogsService.searchCnae({
      q,
      secao,
      page: parseIntOrUndef(page),
      pageSize: parseIntOrUndef(pageSize),
    });
  }

  /**
   * GET /catalogs/ncm?q=&capitulo=&page=&pageSize=
   */
  @Get('ncm')
  searchNcm(
    @Query('q') q?: string,
    @Query('capitulo') capitulo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.catalogsService.searchNcm({
      q,
      capitulo,
      page: parseIntOrUndef(page),
      pageSize: parseIntOrUndef(pageSize),
    });
  }

  /**
   * GET /catalogs/cfop?q=&natureza=ENTRADA|SAIDA&grupo=&page=&pageSize=
   */
  @Get('cfop')
  searchCfop(
    @Query('q') q?: string,
    @Query('natureza') natureza?: string,
    @Query('grupo') grupo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (natureza && natureza !== 'ENTRADA' && natureza !== 'SAIDA') {
      throw new BadRequestException("natureza deve ser 'ENTRADA' ou 'SAIDA'");
    }
    return this.catalogsService.searchCfop({
      q,
      natureza: natureza as 'ENTRADA' | 'SAIDA' | undefined,
      grupo,
      page: parseIntOrUndef(page),
      pageSize: parseIntOrUndef(pageSize),
    });
  }

  /**
   * GET /catalogs/cst-icms — lista completa (~11 registros)
   */
  @Get('cst-icms')
  listCstIcms() {
    return this.catalogsService.listCstIcms();
  }

  /**
   * GET /catalogs/csosn — lista completa (10 registros)
   */
  @Get('csosn')
  listCsosn() {
    return this.catalogsService.listCsosn();
  }

  /**
   * GET /catalogs/municipios?uf=SP&q=&page=&pageSize=
   */
  @Get('municipios')
  searchMunicipios(
    @Query('q') q?: string,
    @Query('uf') uf?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.catalogsService.searchMunicipios({
      q,
      uf,
      page: parseIntOrUndef(page),
      pageSize: parseIntOrUndef(pageSize),
    });
  }

  /**
   * GET /catalogs/ufs — lista das 27 UFs brasileiras (hardcoded)
   */
  @Get('ufs')
  listUfs() {
    return this.catalogsService.listUfs();
  }
}

function parseIntOrUndef(v?: string) {
  return v ? parseInt(v, 10) : undefined;
}
