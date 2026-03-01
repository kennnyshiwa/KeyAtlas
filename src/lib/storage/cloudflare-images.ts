import { cfImageUrl } from "@/lib/cloudflare-images";
import type { StorageProvider, StorageUploadMetadata } from "./index";

interface CloudflareImagesUploadResult {
  id: string;
}

interface CloudflareImagesApiResponse {
  success: boolean;
  errors?: Array<{ message?: string }>;
  result?: CloudflareImagesUploadResult;
}

export class CloudflareImagesStorage implements StorageProvider {
  private readonly accountId: string;
  private readonly apiToken: string;

  constructor() {
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN ?? "";

    if (!this.accountId || !this.apiToken) {
      throw new Error(
        "Cloudflare Images is not configured. Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN"
      );
    }
  }

  async upload(
    file: Buffer,
    filename: string,
    contentType: string,
    metadata?: StorageUploadMetadata
  ): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(file)], { type: contentType });

    formData.append("file", blob, filename);
    formData.append(
      "metadata",
      JSON.stringify({
        userId: metadata?.userId,
        originalFilename: metadata?.originalFilename ?? filename,
      })
    );

    const response = await fetch(this.endpoint("images/v1"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
      body: formData,
      cache: "no-store",
    });

    const payload = (await response.json()) as CloudflareImagesApiResponse;

    if (!response.ok || !payload.success || !payload.result?.id) {
      const reason = payload.errors?.[0]?.message ?? "Unknown Cloudflare Images upload error";
      throw new Error(`Cloudflare Images upload failed: ${reason}`);
    }

    return cfImageUrl(payload.result.id, "public");
  }

  async delete(url: string): Promise<void> {
    const imageId = this.extractImageId(url);

    const response = await fetch(this.endpoint(`images/v1/${imageId}`), {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
      },
      cache: "no-store",
    });

    if (response.status === 404) {
      return;
    }

    const payload = (await response.json()) as CloudflareImagesApiResponse;

    if (!response.ok || !payload.success) {
      const reason = payload.errors?.[0]?.message ?? "Unknown Cloudflare Images delete error";
      throw new Error(`Cloudflare Images delete failed: ${reason}`);
    }
  }

  private endpoint(path: string): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/${path}`;
  }

  private extractImageId(url: string): string {
    const accountHash = process.env.CLOUDFLARE_ACCOUNT_HASH;

    if (!accountHash) {
      throw new Error("CLOUDFLARE_ACCOUNT_HASH is not configured");
    }

    const parsedUrl = new URL(url);
    const parts = parsedUrl.pathname.split("/").filter(Boolean);

    // /{account_hash}/{image_id}/{variant}
    if (parts.length < 2 || parts[0] !== accountHash) {
      throw new Error("Invalid Cloudflare Images delivery URL");
    }

    return parts[1];
  }
}
