import { IsNotEmpty, IsString } from 'class-validator';

export class RejectPartnerDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
