import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import type { StorageProvider } from "./index";

export class LocalStorage implements StorageProvider {
  private uploadDir: string;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR ?? "public/uploads";
  }

  async upload(
    file: Buffer,
    filename: string,
    _contentType: string
  ): Promise<string> {
    const dir = path.join(process.cwd(), this.uploadDir);
    await mkdir(dir, { recursive: true });

    const filePath = path.join(dir, filename);
    await writeFile(filePath, file);

    return `/uploads/${filename}`;
  }

  async delete(url: string): Promise<void> {
    const filename = url.replace("/uploads/", "");
    const filePath = path.join(process.cwd(), this.uploadDir, filename);
    try {
      await unlink(filePath);
    } catch {
      // File may not exist, that's ok
    }
  }
}
