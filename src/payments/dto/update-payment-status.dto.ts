import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { PaymentStatus } from '../../../generated/prisma/enums.js';

export class UpdatePaymentStatusDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
