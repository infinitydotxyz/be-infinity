/* eslint-disable @typescript-eslint/no-unused-vars */
import { Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from 'app.module';
import {
  pushMetadataToSupportedColls,
  pushSupportedCollFlagToMainColls,
  setSupportedCollsInFirestore
} from 'scripts/setSupportedCollsInFirestore';

let app: NestExpressApplication;

export function getService<TInput = any, TResult = TInput>(
  service: Type<TInput> | string | symbol
): TResult | undefined {
  if (!app) {
    console.error('app not bootstrapped');
    return;
  }

  return app.get<TInput, TResult>(service);
}

export const run = async () => {
  app = await NestFactory.create<NestExpressApplication>(AppModule);
  // await setSupportedCollsInFirestore();
  await pushMetadataToSupportedColls();
  // await pushSupportedCollFlagToMainColls();
};

void run();
