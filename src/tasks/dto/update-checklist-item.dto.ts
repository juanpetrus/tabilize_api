import { IsString, IsOptional, IsBoolean, IsInt, Min } from 'class-validator';

export class UpdateChecklistItemDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
