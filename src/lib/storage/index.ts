export interface StorageProvider {
  upload(file: Buffer, filename: string, contentType: string): Promise<string>;
  delete(url: string): Promise<void>;
}

import { LocalStorage } from "./local";

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  switch (provider) {
    case "local":
      return new LocalStorage();
    default:
      return new LocalStorage();
  }
}
