import { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core/nest-factory';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from 'app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  return app;
}

export async function getService<TInput = any, TResult = TInput>(
  service: Type<TInput> | string | symbol,
  app?: NestExpressApplication
): Promise<TResult> {
  if (!app) {
    console.log('bootstrapped app');
    app = await bootstrap();
  }

  return app.get<TInput, TResult>(service);
}
