import { ValidationError } from '@nestjs/common';
import { ClassConstructor, instanceToPlain, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

export async function validateAndStrip<T extends object>(
  cls: ClassConstructor<T>,
  data: T
): Promise<{ result: T; errors: ValidationError[] }> {
  const instance: T = plainToInstance(cls, instanceToPlain(data));
  const errors = await validate(instance, { whitelist: true });
  return {
    result: instance,
    errors
  };
}
