import { newId } from "../shared/ids.ts";
import type { Env } from "./env.ts";

export interface StoredImage {
  bytes: ArrayBuffer;
  mime: string;
}

export interface ImageStore {
  put(bytes: ArrayBuffer, mime: string): Promise<string>;
  get(id: string): Promise<StoredImage | null>;
}

export const IMAGE_MIMES = ["image/jpeg", "image/webp", "image/png"] as const;

const newImageId = () => newId(20);

/** R2 bucket, keys `img/{groupId}/{id}`. */
export class R2ImageStore implements ImageStore {
  constructor(
    private readonly bucket: R2Bucket,
    private readonly groupId: string,
  ) {}

  async put(bytes: ArrayBuffer, mime: string): Promise<string> {
    const id = newImageId();
    await this.bucket.put(`img/${this.groupId}/${id}`, bytes, { httpMetadata: { contentType: mime } });
    return id;
  }

  async get(id: string): Promise<StoredImage | null> {
    const obj = await this.bucket.get(`img/${this.groupId}/${id}`);
    if (!obj) return null;
    return { bytes: await obj.arrayBuffer(), mime: obj.httpMetadata?.contentType ?? "application/octet-stream" };
  }
}

/** Inside the group DO: `img:{id}` → `{ mime, bytes, createdAt }`. */
export class DoImageStore implements ImageStore {
  constructor(private readonly storage: DurableObjectStorage) {}

  async put(bytes: ArrayBuffer, mime: string): Promise<string> {
    const id = newImageId();
    await this.storage.put(`img:${id}`, { mime, bytes, createdAt: Date.now() });
    return id;
  }

  async get(id: string): Promise<StoredImage | null> {
    const row = await this.storage.get<{ mime: string; bytes: ArrayBuffer }>(`img:${id}`);
    return row ? { bytes: row.bytes, mime: row.mime } : null;
  }
}

/** R2 when the `IMAGES` binding exists, otherwise the DO's own storage. */
export function createImageStore(env: Env, groupId: string, storage: DurableObjectStorage): ImageStore {
  return env.IMAGES ? new R2ImageStore(env.IMAGES, groupId) : new DoImageStore(storage);
}
