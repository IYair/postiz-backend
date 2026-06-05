import {
  IsDefined,
  IsIn,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { makeId } from '@gitroom/nestjs-libraries/services/make.is';

export class ChangePasswordDto {
  @IsString()
  @IsDefined()
  @MinLength(3)
  currentPassword: string;

  @IsString()
  @IsDefined()
  @MinLength(8)
  password: string;

  @IsString()
  @IsDefined()
  @IsIn([makeId(10)], {
    message: 'Passwords do not match',
  })
  @ValidateIf((o) => o.password !== o.repeatPassword)
  repeatPassword: string;
}
