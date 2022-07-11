import { HttpException, HttpStatus } from '@nestjs/common';

export class ApiAuthException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}
