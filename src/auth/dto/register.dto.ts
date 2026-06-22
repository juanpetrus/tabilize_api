import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { BillingCycle } from 'generated/prisma/enums';
import { IsCpfOrCnpj } from '../../common/validators/is-cpf-or-cnpj.validator';

export class RegisterDto {
  @ApiProperty({ example: 'João da Silva', description: 'Nome do titular da conta' })
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @ApiProperty({ example: 'joao@empresa.com.br', format: 'email' })
  @IsEmail({}, { message: 'Email inválido' })
  @IsNotEmpty({ message: 'Email é obrigatório' })
  email: string;

  @ApiProperty({ example: 'senhaSegura123', minLength: 6, description: 'Senha (mín. 6 caracteres)' })
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;

  @ApiProperty({ example: 'Escritório Silva Contabilidade', description: 'Nome do escritório/time' })
  @IsString()
  @IsNotEmpty({ message: 'Nome do escritório não pode ser vazio' })
  teamName: string;

  @ApiProperty({ enum: ['plan_starter', 'plan_pro'], example: 'plan_starter' })
  @IsString()
  @IsIn(['plan_starter', 'plan_pro'], { message: 'Plano inválido' })
  planId: string;

  @ApiProperty({
    example: '12345678901',
    description: 'CPF (11 dígitos) ou CNPJ (14 dígitos), somente números',
    pattern: '^\\d{11}$|^\\d{14}$',
  })
  @IsString()
  @Matches(/^\d{11}$|^\d{14}$/, {
    message: 'Documento deve ter 11 dígitos (CPF) ou 14 dígitos (CNPJ)',
  })
  @IsCpfOrCnpj({
    message: 'Documento inválido: informe um CPF ou CNPJ válido',
  })
  document: string;

  @ApiProperty({
    example: '11999998888',
    description: 'Telefone com DDD (10 ou 11 dígitos), somente números',
    pattern: '^\\d{10,11}$',
  })
  @IsString()
  @Matches(/^\d{10,11}$/, {
    message: 'Telefone deve ter DDD + número (10 ou 11 dígitos)',
  })
  phone: string;

  @ApiProperty({ enum: BillingCycle, example: 'MONTH', description: 'Periodicidade da cobrança' })
  @IsString()
  @IsEnum(BillingCycle, {
    message: 'O periodo deve ter um dos seguintes valores: MONTH, YEAR',
  })
  billingCycle: string;

  @ApiPropertyOptional({
    example: 'parceiro-xyz',
    description: 'Slug do parceiro que indicou (cookie tabilize_ref)',
  })
  @IsOptional()
  @IsString()
  partnerSlug?: string;
}
