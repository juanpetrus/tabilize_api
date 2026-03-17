import { IsEnum } from 'class-validator';
import { ServiceRequestStatus } from '../../../generated/prisma/enums.js';

export class UpdateServiceRequestStatusDto {
  @IsEnum(ServiceRequestStatus)
  status: ServiceRequestStatus;
}
