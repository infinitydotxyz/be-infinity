import { Module } from '@nestjs/common';
import { EthereumModule } from 'ethereum/ethereum.module';
import { MerkleTreeService } from './merkle-tree.service';

@Module({
  providers: [MerkleTreeService],
  imports: [EthereumModule],
  exports: [MerkleTreeService]
})
export class MerkleTreeModule {}
