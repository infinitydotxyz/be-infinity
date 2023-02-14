import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { EnvironmentVariables } from 'types/environment-variables.interface';
import pgPromise from 'pg-promise';

@Injectable()
export class PostgresService {
  private readonly _pool: Pool;
  private readonly _pgpDB;

  public get pool() {
    return this._pool;
  }

  public get pgpDB() {
    return this._pgpDB;
  }

  constructor(private configService: ConfigService<EnvironmentVariables, true>) {
    const conn = {
      host: this.configService.get('PG_HOST'),
      port: this.configService.get('PG_PORT'),
      user: this.configService.get('PG_USER'),
      password: this.configService.get('PG_PASS'),
      database: this.configService.get('PG_DB_NAME'),
      max: 20,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 20000
    };

    this._pool = new Pool(conn);

    const pgp = pgPromise({
      capSQL: true
    });
    this._pgpDB = pgp(conn);
  }
}
