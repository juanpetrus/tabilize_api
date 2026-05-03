import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateItemDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  path?: string; // Para mover o item

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  competenceMonth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  competenceYear?: number;
}
