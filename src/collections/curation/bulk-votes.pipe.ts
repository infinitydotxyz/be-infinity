import { CurationVoteBulkDto } from '@infinityxyz/lib/types/dto/collections/curation/curation-vote.dto';
import { PipeTransform, Injectable } from '@nestjs/common';
import { ParsedCollectionId } from 'collections/collection-id.pipe';
import { FirebaseService } from 'firebase/firebase.service';

export type ParsedBulkVotes = {
  votes: number;
  parsedCollectionId: ParsedCollectionId;
};

@Injectable()
export class ParsedBulkVotesPipe implements PipeTransform<CurationVoteBulkDto[], Promise<ParsedBulkVotes[]>> {
  constructor(private firebaseService: FirebaseService) {}

  async transform(values: CurationVoteBulkDto[]): Promise<ParsedBulkVotes[]> {
    const result: ParsedBulkVotes[] = [];

    for (const value of values) {
      result.push({
        votes: value.votes,
        parsedCollectionId: await this.firebaseService.parseCollectionId(value.collection)
      });
    }

    return result;
  }
}
