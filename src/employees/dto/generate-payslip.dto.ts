import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum PayslipItemTypeDto {
  EARNING = 'EARNING',
  DEDUCTION = 'DEDUCTION',
}

export class PayslipItemDto {
  @IsString()
  code: string;

  @IsString()
  description: string;

  @IsEnum(PayslipItemTypeDto)
  type: PayslipItemTypeDto;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsNumber()
  @Min(0)
  value: number;
}

export class GeneratePayslipDto {
  @IsInt()
  @Min(1)
  @Max(12)
  competenceMonth: number;

  @IsInt()
  @Min(2000)
  competenceYear: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayslipItemDto)
  items: PayslipItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseInss?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  baseIrrf?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fgtsValue?: number;
}
