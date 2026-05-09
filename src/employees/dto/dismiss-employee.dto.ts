import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
import { DismissalType } from '../../../generated/prisma/enums.js';

export class DismissEmployeeDto {
  @IsDateString()
  dismissalDate: string;

  @IsEnum(DismissalType)
  dismissalType: DismissalType;

  @IsOptional()
  @IsString()
  notes?: string;
}
