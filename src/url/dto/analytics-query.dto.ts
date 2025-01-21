import { IsOptional, IsNumber } from 'class-validator';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsNumber()
  offset?: number;
}