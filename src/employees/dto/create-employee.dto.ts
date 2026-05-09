import {
  IsString,
  IsOptional,
  IsEmail,
  IsDateString,
  IsNumber,
  IsEnum,
} from 'class-validator';
import {
  ContractType,
  EmployeeStatus,
} from '../../../generated/prisma/enums.js';

export class CreateEmployeeDto {
  @IsString()
  name: string;

  @IsString()
  cpf: string;

  @IsOptional()
  @IsString()
  rg?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsDateString()
  admissionDate: string;

  @IsString()
  position: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsNumber()
  salary: number;

  @IsOptional()
  @IsString()
  workCard?: string;

  @IsOptional()
  @IsString()
  pis?: string;

  @IsOptional()
  @IsEnum(ContractType)
  contractType?: ContractType;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
