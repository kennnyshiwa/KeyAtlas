import type { StorageProvider } from "./index";

export class R2Storage implements StorageProvider {
  async upload(
    _file: Buffer,
    _filename: string,
    _contentType: string
  ): Promise<string> {
    throw new Error("R2 storage not implemented yet. Coming in Phase 2.");
  }

  async delete(_url: string): Promise<void> {
    throw new Error("R2 storage not implemented yet. Coming in Phase 2.");
  }
}
