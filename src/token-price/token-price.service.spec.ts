import { Test, TestingModule } from '@nestjs/testing';
import { TokenPriceService } from './token-price.service';

describe('TokenPriceService', () => {
  let service: TokenPriceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenPriceService],
    }).compile();

    service = module.get<TokenPriceService>(TokenPriceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
