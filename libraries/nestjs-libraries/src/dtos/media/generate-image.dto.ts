import {
  ArrayMaxSize,
  IsArray,
  IsBase64,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  registerDecorator,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';

// Providers (Gemini, DALL-E) accept these as multimodal input. Keep the list
// small so we fail fast on unsupported formats before paying for a call.
const SUPPORTED_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

const MAX_DECODED_BYTES = 4 * 1024 * 1024;

// Precise decoded-size check. Base64 encodes 3 bytes per 4 chars, minus the
// number of '=' pads. class-validator's own @MaxLength on the encoded string
// would only be a loose heuristic and could miss oversized payloads when
// whitespace or padding differs.
function MaxDecodedBase64Bytes(
  max: number,
  options?: ValidationOptions
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxDecodedBase64Bytes',
      target: object.constructor,
      propertyName,
      constraints: [max],
      options,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const clean = value.replace(/\s+/g, '');
          if (clean.length === 0) return false;
          const padding =
            clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
          const decoded = Math.floor(clean.length / 4) * 3 - padding;
          return decoded <= max;
        },
        defaultMessage() {
          return `base64 payload exceeds ${max} decoded bytes`;
        },
      },
    });
  };
}

export class ImageReferenceDto {
  @IsString()
  @IsIn(SUPPORTED_IMAGE_MIME_TYPES as unknown as string[])
  mimeType: (typeof SUPPORTED_IMAGE_MIME_TYPES)[number];

  @IsString()
  @IsBase64()
  @MaxDecodedBase64Bytes(MAX_DECODED_BYTES)
  base64: string;
}

export class GenerateImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt: string;

  @IsOptional()
  @IsIn(['square', 'landscape', 'portrait', 'story'])
  aspectRatio?: 'square' | 'landscape' | 'portrait' | 'story';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ImageReferenceDto)
  referenceImages?: ImageReferenceDto[];

  @IsOptional()
  @IsBoolean()
  skipExpansion?: boolean;
}

export class ExpandImagePromptDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  prompt: string;
}
