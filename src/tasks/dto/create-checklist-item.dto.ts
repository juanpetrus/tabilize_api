import { IsString, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';

export class CreateChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
