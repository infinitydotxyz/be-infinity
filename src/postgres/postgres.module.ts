import { PostgresService } from './postgres.service';
import { DynamicModule, Module } from '@nestjs/common';

@Module({})
export class PostgresModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      module: PostgresModule,
      providers: [PostgresService],
      exports: [PostgresService]
    };
  }
}
