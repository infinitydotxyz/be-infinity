import { Test, TestingModule } from '@nestjs/testing';
import { ProtocolOrdersService } from './protocol-orders.service';

describe('ProtocolOrdersService', () => {
  let service: ProtocolOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProtocolOrdersService]
    }).compile();

    service = module.get<ProtocolOrdersService>(ProtocolOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
