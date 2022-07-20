import { Test, TestingModule } from '@nestjs/testing';
import { CurationController } from './curation.controller';

describe('CurationController', () => {
  let controller: CurationController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurationController]
    }).compile();

    controller = module.get<CurationController>(CurationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
