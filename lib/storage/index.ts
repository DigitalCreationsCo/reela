import { Storage } from '@google-cloud/storage';
import path from 'path';

export interface StorageProvider {
  uploadFile(fileId: string, data: Buffer, contentType: string, isTemporary: boolean): Promise<string>;
  getFile(fileId: string): Promise<Buffer>;
  getSignedUrl(fileId: string, expirationMinutes: number): Promise<string>;
  deleteFile(fileId: string): Promise<void>;
}

export class GoogleCloudStorageProvider implements StorageProvider {
  private storage: Storage;
  private bucketName: string;

  constructor(bucketName: string) {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64) {
      throw new Error('Environment variable GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64 is not set.');
    }
    const credentialsJson = Buffer.from(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_BASE64,
        "base64"
      ).toString("utf8");
    this.storage = new Storage({ credentials: JSON.parse(credentialsJson) });
    this.bucketName = bucketName;
  }

  async uploadFile(fileId: string, data: Buffer, contentType: string, isTemporary: boolean): Promise<string> {
    const file = this.storage.bucket(this.bucketName).file(fileId);
    await file.save(data, {
      metadata: {
        contentType: contentType,
        'x-goog-meta-is-temporary': isTemporary ? 'true' : 'false',
      },
    });
    return `gs://${this.bucketName}/${fileId}`;
  }

  async getFile(fileId: string): Promise<Buffer> {
    const [data] = await this.storage.bucket(this.bucketName).file(fileId).download();
    return data;
  }

  async getSignedUrl(fileId: string, expirationMinutes: number): Promise<string> {
    const [url] = await this.storage.bucket(this.bucketName).file(fileId).getSignedUrl({
      action: 'read',
      expires: Date.now() + expirationMinutes * 60 * 1000, // Convert minutes to milliseconds
    });
    return url;
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.storage.bucket(this.bucketName).file(fileId).delete();
  }
}

export class ObjectStorageManager {
  private provider: StorageProvider;

  constructor(provider: StorageProvider) {
    this.provider = provider;
  }

  async uploadVideo(fileId: string, data: Buffer, contentType: string, isTemporary: boolean): Promise<string> {
    return this.provider.uploadFile(fileId, data, contentType, isTemporary);
  }

  async getVideo(fileId: string): Promise<Buffer> {
    return this.provider.getFile(fileId);
  }

  async getSignedVideoUrl(fileId: string, expirationMinutes: number): Promise<string> {
    return this.provider.getSignedUrl(fileId, expirationMinutes);
  }

  async deleteVideo(fileId: string): Promise<void> {
    return this.provider.deleteFile(fileId);
  }
}
