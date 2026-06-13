import { IsDateString, IsIn, IsOptional } from 'class-validator';

export type ChangePostGroupStatusTarget = 'draft' | 'scheduled' | 'publish_now';

export class ChangePostGroupStatusDto {
  @IsIn(['draft', 'scheduled', 'publish_now'])
  target!: ChangePostGroupStatusTarget;

  @IsOptional()
  @IsDateString()
  date?: string;
}
