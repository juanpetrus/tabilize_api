import { IsString, IsNotEmpty, IsNumber, IsDateString, IsOptional, IsBoolean, IsEnum, Min } from 'class-validator';
import { RecurrenceInterval } from '../../../generated/prisma/enums.js';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  description: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  referenceMonth?: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsEnum(RecurrenceInterval)
  recurrenceInterval?: RecurrenceInterval;

  @IsOptional()
  @IsDateString()
  recurrenceEndDate?: string;
}
