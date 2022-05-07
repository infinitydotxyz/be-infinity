import { Bucket, File } from '@google-cloud/storage';
import { error, log } from '@infinityxyz/lib/utils';
import firebaseAdmin, { ServiceAccount } from 'firebase-admin';
import { Readable } from 'stream';
import { singleton } from 'tsyringe';
import { FB_STORAGE_BUCKET } from '../constants';
import * as serviceAccount from '../creds/nftc-dev-firebase-creds.json';

@singleton()
export default class Firestore {
  db: FirebaseFirestore.Firestore;

  bucket: Bucket;

  constructor() {
    const app = firebaseAdmin.initializeApp(
      {
        credential: firebaseAdmin.credential.cert(serviceAccount as ServiceAccount),
        storageBucket: FB_STORAGE_BUCKET
      },
      'secondary'
    );
    this.db = app.firestore();
    this.db.settings({ ignoreUndefinedProperties: true });
    this.bucket = app.storage().bucket();
  }

  collection(collectionPath: string): FirebaseFirestore.CollectionReference<FirebaseFirestore.DocumentData> {
    return this.db.collection(collectionPath);
  }

  getHistoricalDocId(year: number, week: number) {
    return `${year}-${week}`;
  }

  async uploadBuffer(buffer: Buffer, path: string, contentType: string): Promise<File> {
    const remoteFile = this.bucket.file(path);

    // No idea why exists() returns an array [boolean]
    const existsArray = await remoteFile.exists();
    if (existsArray && existsArray.length > 0 && !existsArray[0]) {
      return await new Promise<File>((resolve, reject) => {
        Readable.from(buffer).pipe(
          remoteFile
            .createWriteStream({
              metadata: {
                contentType
              }
            })
            .on('error', (err) => {
              error(err);

              reject(err);
            })
            .on('finish', () => {
              log(`uploaded: ${remoteFile.name}`);

              resolve(remoteFile);
            })
        );
      });
    }

    return remoteFile;
  }
}
