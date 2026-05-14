import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IndicadorIeDestinatario,
  TipoPessoa,
} from '../../../generated/prisma/enums.js';

export class UpdateCustomerDto {
  @IsOptional()
  @IsEnum(TipoPessoa)
  tipoPessoa?: TipoPessoa;

  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, {
    message: 'cpfCnpj deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ)',
  })
  cpfCnpj?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nomeFantasia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(14)
  inscricaoEstadual?: string;

  @IsOptional()
  @IsEnum(IndicadorIeDestinatario)
  indicadorIe?: IndicadorIeDestinatario;

  @IsOptional()
  @IsString()
  inscricaoSuframa?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  logradouro?: string;

  @IsOptional()
  @IsString()
  numero?: string;

  @IsOptional()
  @IsString()
  complemento?: string;

  @IsOptional()
  @IsString()
  bairro?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, { message: 'cep deve ter exatamente 8 dígitos' })
  cep?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{7}$/, {
    message: 'codIbgeMunicipio deve ter exatamente 7 dígitos',
  })
  codIbgeMunicipio?: string;

  @IsOptional()
  @IsString()
  municipio?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'uf deve ser uma sigla de 2 letras maiúsculas' })
  uf?: string;

  @IsOptional()
  @IsString()
  codPais?: string;

  @IsOptional()
  @IsString()
  pais?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
