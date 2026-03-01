import fs from "fs/promises";
import path from "path";

interface StorageProvider {
  upload(buffer: Buffer, filename: string, mimeType: string): Promise<string>;
}

class LocalStorageProvider implements StorageProvider {
  private uploadDir: string;
  private baseUrl: string;

  constructor() {
    this.uploadDir = path.join(process.cwd(), process.env.UPLOAD_DIR ?? "public/uploads");
    this.baseUrl = "/uploads";
  }

  async upload(buffer: Buffer, filename: string, _mimeType: string): Promise<string> {
    await fs.mkdir(this.uploadDir, { recursive: true });
    const dest = path.join(this.uploadDir, filename);
    await fs.writeFile(dest, buffer);
    return `${this.baseUrl}/${filename}`;
  }
}

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  if (provider === "local") {
    return new LocalStorageProvider();
  }

  throw new Error(`Unknown storage provider: ${provider}. Set STORAGE_PROVIDER=local or implement R2 provider.`);
}
