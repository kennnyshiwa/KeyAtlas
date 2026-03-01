export interface StorageUploadMetadata {
  userId?: string;
  originalFilename?: string;
}

export interface StorageProvider {
  upload(
    file: Buffer,
    filename: string,
    contentType: string,
    metadata?: StorageUploadMetadata
  ): Promise<string>;
  delete(url: string): Promise<void>;
}

import { CloudflareImagesStorage } from "./cloudflare-images";
import { LocalStorage } from "./local";

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  switch (provider) {
    case "cloudflare":
      return new CloudflareImagesStorage();
    case "local":
    default:
      return new LocalStorage();
  }
}
