

import { IsString, IsOptional, IsUrl, IsNumber } from 'class-validator';
import { IsValidSchema } from './schema-validator';

export class ShortenUrlDto {
  @IsString()
  @IsUrl()
  url: string;

  @IsOptional()
  @IsString()
  customCode?: string;

  @IsOptional()
  @IsNumber()
  ttlMinutes?: number;

  @IsValidSchema({
    type: 'object',
    properties: {
      url: { type: 'string', format: 'url' },
    },
  })
  schema?: any;
}
