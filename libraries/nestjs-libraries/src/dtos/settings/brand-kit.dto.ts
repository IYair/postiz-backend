import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsSafeWebhookUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';

export class BrandKitDto {
  @IsBoolean()
  brandKitEnabled: boolean;

  // Backend fetches this URL to attach the logo as a reference image, so it
  // must go through the same SSRF guard used for webhook URLs (public HTTPS,
  // no loopback / private / link-local). Allow null/empty so users can clear.
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  @MaxLength(500)
  @IsSafeWebhookUrl({ message: 'brandLogoUrl must be a public HTTPS URL' })
  brandLogoUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  brandColors?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  brandTypography?: string | null;
}
