import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  Crt,
  Estabelecimento,
  IndicadorAtividade,
  RegimeEspecial,
  UsarCstCsosn,
} from '../../../generated/prisma/enums.js';

export class UpdateFiscalDataDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  companyCode?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(ISENTO|.{1,14})$/)
  inscricaoEstadual?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  inscricaoEstadualST?: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  inscricaoMunicipal?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nomeFantasia?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d\/\d{2}$/)
  cnaePrincipal?: string;

  @IsOptional()
  @IsEnum(Crt)
  crt?: Crt;

  @IsOptional()
  @IsEnum(RegimeEspecial)
  regimeEspecial?: RegimeEspecial;

  @IsOptional()
  @IsEnum(Estabelecimento)
  estabelecimento?: Estabelecimento;

  @IsOptional()
  @IsEnum(IndicadorAtividade)
  indicadorAtividade?: IndicadorAtividade;

  @IsOptional()
  @IsBoolean()
  produtorRural?: boolean;

  @IsOptional()
  @IsEnum(UsarCstCsosn)
  usarCstCsosn?: UsarCstCsosn;
}
