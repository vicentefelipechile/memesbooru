// R2 helpers — PLAN 12
export async function putObject(bucket: R2Bucket, key: string, body: ArrayBuffer | Uint8Array | string, contentType: string): Promise<void> {
  await bucket.put(key, body, { httpMetadata: { contentType } });
}
export async function getObject(bucket: R2Bucket, key: string): Promise<R2ObjectBody | null> {
  return bucket.get(key);
}
// Validacion MIME real via magic bytes (Fase 5)
export function detectMime(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49) return "image/gif";
  if (bytes.slice(0, 4).toString() === "RIFF" && bytes.slice(8, 12).toString() === "WEBP") return "image/webp";
  if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00) return "video/mp4";
  return null;
}
