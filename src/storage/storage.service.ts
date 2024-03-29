import { Injectable } from '@nestjs/common';
import { FirebaseService } from 'firebase/firebase.service';
import { FileBlob, SaveFileOptions } from './storage.types';
import { createHash } from 'crypto';

@Injectable()
export class StorageService {
  constructor(private firebaseService: FirebaseService) {}

  private md5(data: Buffer) {
    return createHash('md5').update(data).digest('hex');
  }

  private getPath(file: FileBlob, root = 'images') {
    if (file.data) {
      const hash = this.md5(file.data);
      return `${root}/collections/${hash}.${file.extension}`;
    }
  }

  private fromFilePath(filePath: string): FileBlob {
    const split = filePath.split('.');
    return { fileName: split[0], extension: split[1] };
  }

  /**
   * Check if the specified file exists in the cloud bucket.
   */
  async isExistingFile(file: FileBlob | string, root = 'images') {
    if (typeof file === 'string') {
      file = this.fromFilePath(file);
    }
    const path = this.getPath(file, root);

    if (path) {
      const remoteFile = this.firebaseService.bucket.file(path);
      const existingFiles = await remoteFile.exists();
      return existingFiles && existingFiles.length > 0;
    }
  }

  /**
   * Saves the specified file in the cloud bucket.
   * @param image the file to save
   */
  async saveFile(file: FileBlob | string, options?: SaveFileOptions) {
    if (typeof file === 'string') {
      file = {
        ...options,
        ...this.fromFilePath(file)
      };
    }

    if (file.data) {
      const path = this.getPath(file, options?.root);

      if (path) {
        const remoteFile = this.firebaseService.bucket.file(path);
        await remoteFile.save(file.data, { contentType: file.contentType });
        return remoteFile;
      }
    }
  }

  /**
   * Saves the specified image in the cloud bucket.
   * @param image the image to save
   */
  async saveImage(image: FileBlob | string, options?: SaveFileOptions) {
    return await this.saveFile(image, options);
  }
}
