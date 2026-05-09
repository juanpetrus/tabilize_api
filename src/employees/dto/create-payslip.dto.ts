import { IsInt, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreatePayslipDto {
  @IsInt()
  @Min(1)
  @Max(12)
  competenceMonth: number;

  @IsInt()
  @Min(2000)
  competenceYear: number;

  @IsNumber()
  @Min(0)
  grossSalary: number;

  @IsNumber()
  @Min(0)
  netSalary: number;

  @IsOptional()
  @IsNumber()
  deductions?: number;
}
