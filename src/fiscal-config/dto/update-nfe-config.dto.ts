import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  AmbienteSefaz,
  TipoContingencia,
} from '../../../generated/prisma/enums.js';

export class UpdateNfeConfigDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,3}$/)
  serie?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ultimaNfe?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  aliquotaCreditoSimples?: number;

  @IsOptional()
  @IsBoolean()
  danfeSimplificado?: boolean;

  @IsOptional()
  @IsEnum(AmbienteSefaz)
  ambiente?: AmbienteSefaz;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observacoes?: string;

  @IsOptional()
  @IsEnum(TipoContingencia)
  tipoContingencia?: TipoContingencia;

  @IsOptional()
  @IsString()
  @MinLength(15)
  @MaxLength(256)
  contingenciaJustificativa?: string;

  @IsOptional()
  @IsDateString()
  contingenciaInicio?: string;

  @IsOptional()
  @IsBoolean()
  calcularIcmsDesonerado?: boolean;

  @IsOptional()
  @IsBoolean()
  incluirFreteBaseIcms?: boolean;

  @IsOptional()
  @IsBoolean()
  destacarValorIcmsSt?: boolean;
}
