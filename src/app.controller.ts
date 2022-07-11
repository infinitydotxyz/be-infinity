import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';

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
}
