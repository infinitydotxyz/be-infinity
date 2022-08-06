import { Controller, Get, Redirect } from '@nestjs/common';
import { ApiFoundResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';

@Controller()
export class AppController {
  @Get('ping')
  @ApiOperation({
    description: 'Bare minimum sanity check'
  })
  @ApiOkResponse({
    description: "Should reply with 'pong'"
  })
  ping() {
    return 'pong';
  }

  @Get()
  @Redirect('/docs/')
  @ApiFoundResponse({
    description: 'Redirect to /docs'
  })
  redirectToDocs() {
    return;
  }
}
