import { IsString, MinLength } from 'class-validator';

export class MediaReferenceDto {
  @IsString()
  @MinLength(1)
  mediaId: string;
}
