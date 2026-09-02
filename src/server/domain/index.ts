// Domain — reglas puras sin Cloudflare (PLAN 5)
export type UserRank = "new" | "normal" | "trusted" | "restricted" | "banned";
export type PostStatus = "uploading" | "processing" | "available" | "duplicate" | "rejected" | "hidden";
export type MediaType = "image" | "gif" | "video";

export const RANKS = {
  canUploadVideo: (r: UserRank) => r === "trusted",
  canUpload: (r: UserRank, status: string) => status === "active" && r !== "banned",
  isNewCooldown: (r: UserRank) => r === "new",
};

export function scoreDecay(score: number, hours: number): number {
  // Placeholder — Fase 6 definira formula exacta. Por ahora log simple
  return score / Math.pow(hours + 2, 1.5);
}

export function isValidMediaMime(mime: string, mediaType: MediaType): boolean {
  const map: Record<MediaType, string[]> = {
    image: ["image/jpeg", "image/png", "image/webp", "image/avif"],
    gif: ["image/gif"],
    video: ["video/mp4", "video/webm", "video/quicktime"],
  };
  return map[mediaType]?.includes(mime) ?? false;
}

export function publicIdFromId(id: number): string {
  // Opaco base62 — simple para Fase 4
  return id.toString(36).padStart(6, "0");
}
