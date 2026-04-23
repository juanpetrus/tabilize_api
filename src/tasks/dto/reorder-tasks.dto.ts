import { IsArray, IsEnum, IsInt, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TaskStatus } from '../../../generated/prisma/enums.js';

class ReorderItem {
  @IsUUID()
  id: string;

  @IsInt()
  @Min(0)
  order: number;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}

export class ReorderTasksDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items: ReorderItem[];
}
