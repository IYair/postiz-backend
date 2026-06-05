import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ImagePromptExtraDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  imagePromptExtra?: string | null;
}
