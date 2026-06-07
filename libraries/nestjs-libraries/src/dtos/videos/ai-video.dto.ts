import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ImageRefDto {
  @IsString() mimeType: string;
  @IsString() base64: string;
}

export class AiVideoDto {
  @IsIn(['text', 'frames', 'ingredients'])
  mode: 'text' | 'frames' | 'ingredients';

  @IsOptional() @IsString()
  prompt?: string;

  @IsIn(['16:9', '9:16', 'auto'])
  aspectRatio: '16:9' | '9:16' | 'auto';

  @IsOptional() @IsInt() @Min(1) @Max(8)
  durationSeconds?: number;

  @IsOptional() @IsInt()
  seed?: number;

  @IsInt() @Min(1) @Max(4)
  numberOfVideos: number;

  @IsOptional() @ValidateNested() @Type(() => ImageRefDto)
  startImage?: ImageRefDto;

  @IsOptional() @ValidateNested() @Type(() => ImageRefDto)
  endImage?: ImageRefDto;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ImageRefDto)
  referenceImages?: ImageRefDto[];

  @IsOptional() @IsString()
  negativePrompt?: string;
}
