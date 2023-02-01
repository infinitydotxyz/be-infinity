import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiFoundResponse } from '@nestjs/swagger';

@Controller()
export class AppController {
  @Get()
  @Redirect('/docs/')
  @ApiFoundResponse({
    description: 'Redirect to /docs'
  })
  redirectToDocs() {
    return;
  }
}
