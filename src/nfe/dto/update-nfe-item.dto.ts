import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { MercadoriaOrigem } from '../../../generated/prisma/enums.js';

export class UpdateNfeItemDto {
  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  quantidade?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  valorUnitario?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  desconto?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/)
  cfop?: string;

  @IsOptional()
  @IsString()
  @MaxLength(6)
  unidade?: string;

  @IsOptional()
  @IsEnum(MercadoriaOrigem)
  origem?: MercadoriaOrigem;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2,3}$/)
  cstIcms?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseCalcIcms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  aliquotaIcms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseCalcIcmsSt?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  aliquotaIcmsSt?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  cstPis?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseCalcPis?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  aliquotaPis?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  cstCofins?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseCalcCofins?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  aliquotaCofins?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}$/)
  cstIpi?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseCalcIpi?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  aliquotaIpi?: number;
}
