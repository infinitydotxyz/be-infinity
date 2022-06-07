import { Test, TestingModule } from '@nestjs/testing';
import { TestModule } from 'test.module';
import { OpenseaService } from './opensea.service';

describe('OpenseaService', () => {
  let service: OpenseaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [TestModule],
      providers: [OpenseaService]
    }).compile();

    service = module.get<OpenseaService>(OpenseaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
