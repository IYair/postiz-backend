import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class GetHolidaysDto {
  @IsInt()
  @Min(1)
  @Max(12)
  @Transform(({ value }) => parseInt(value, 10))
  month: number;

  @IsInt()
  @Min(2020)
  @Max(2100)
  @Transform(({ value }) => parseInt(value, 10))
  year: number;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  country?: string;
}
