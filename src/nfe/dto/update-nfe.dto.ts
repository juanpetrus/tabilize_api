import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  NfeFinalidade,
  NfeModFrete,
  NfeTipoOperacao,
} from '../../../generated/prisma/enums.js';

export class UpdateNfeDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  naturezaOperacao?: string;

  @IsOptional()
  @IsEnum(NfeTipoOperacao)
  tipoOperacao?: NfeTipoOperacao;

  @IsOptional()
  @IsEnum(NfeModFrete)
  modFrete?: NfeModFrete;

  @IsOptional()
  @IsEnum(NfeFinalidade)
  finalidade?: NfeFinalidade;

  @IsOptional()
  @IsString()
  @Matches(/^[0-5]$|^9$/)
  indicadorPresenca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observacoesFiscais?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  observacoesContrib?: string;
}
