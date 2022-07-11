import { Test, TestingModule } from '@nestjs/testing';
import { CurationService } from './curation.service';

describe('CurationService', () => {
  let service: CurationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CurationService],
    }).compile();

    service = module.get<CurationService>(CurationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
