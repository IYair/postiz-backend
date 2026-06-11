import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateToolDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  input: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  network?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  toneOverride?: string;
}
