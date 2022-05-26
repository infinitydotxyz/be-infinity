import { ApiProperty } from '@nestjs/swagger';

export class OrderMatchesArrayDto {
  @ApiProperty({ description: 'Array of signed orders', type: [] })
  data: any[];

  @ApiProperty({ description: 'Cursor that can be used to get the next page' })
  cursor: string;

  @ApiProperty({ description: 'Whether there are more results available' })
  hasNextPage: boolean;
}
