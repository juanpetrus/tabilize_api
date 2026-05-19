import { IsUUID } from 'class-validator';

export class ConvertLeadDto {
  @IsUUID()
  teamId: string;
}
