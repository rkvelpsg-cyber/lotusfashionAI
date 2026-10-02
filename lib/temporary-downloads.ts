export type DownloadImageContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export interface PrivateImageStorage {
  putPrivate(input: {
    bytes: Uint8Array;
    contentType: DownloadImageContentType;
    expiresAt: number;
  }): Promise<{ objectKey: string }>;
  getPrivate(objectKey: string): Promise<{
    bytes: Uint8Array;
    contentType: DownloadImageContentType;
  } | null>;
  deletePrivate(objectKey: string): Promise<void>;
}

export interface TemporaryDownloadGrant {
  tokenHash: string;
  objectKey: string;
  sessionId: string;
  expiresAt: number;
}

export interface TemporaryDownloadGrantStore {
  create(grant: TemporaryDownloadGrant): Promise<void>;
  findActive(
    tokenHash: string,
    now: number,
  ): Promise<TemporaryDownloadGrant | null>;
  deleteForSession(sessionId: string): Promise<void>;
  deleteExpired(now: number): Promise<number>;
}
