import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { LeadActivityType } from 'generated/prisma/enums';

// Não permite criar STATUS_CHANGE manualmente — é gerado automaticamente
type ManualActivityType = Exclude<LeadActivityType, 'STATUS_CHANGE'>;

export class CreateActivityDto {
  @IsEnum(LeadActivityType)
  @IsIn(['NOTE', 'EMAIL', 'CALL', 'MEETING'])
  type: ManualActivityType;

  @IsOptional()
  @IsString()
  content?: string;
}
