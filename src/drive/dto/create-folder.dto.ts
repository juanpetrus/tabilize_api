import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  path?: string; // Caminho pai (default: "/")

  @IsOptional()
  @IsString()
  description?: string;
}
