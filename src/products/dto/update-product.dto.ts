import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MercadoriaOrigem } from '../../../generated/prisma/enums.js';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  codigoInterno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  codigoBarras?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  descricao?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2,8}$/, { message: 'ncmCodigo deve ter entre 2 e 8 dígitos' })
  ncmCodigo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, { message: 'cestCodigo deve ter exatamente 7 dígitos' })
  cestCodigo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'cfopPadrao deve ter exatamente 4 dígitos' })
  cfopPadrao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  unidade?: string;

  @IsOptional()
  @IsEnum(MercadoriaOrigem)
  origem?: MercadoriaOrigem;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/, { message: 'cstIcmsPadrao deve ter exatamente 2 dígitos' })
  cstIcmsPadrao?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{3}$/, { message: 'csosnPadrao deve ter exatamente 3 dígitos' })
  csosnPadrao?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliquotaIcms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliquotaPis?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliquotaCofins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliquotaIpi?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoVenda?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  precoCusto?: number;
}
