import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ImagePresetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  stylePrompt: string;

  @IsOptional()
  @IsIn(['square', 'landscape', 'portrait', 'story'])
  aspectRatio?: 'square' | 'landscape' | 'portrait' | 'story';
}
