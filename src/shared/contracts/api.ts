// Contratos API — Fase 9 completada
// Normalizados según PLAN 17 Fase 0

export type HealthResponse = { status: "ok"; version: string; db: "ok" | "unconfigured" };

export type UserRank = "new" | "normal" | "trusted" | "restricted" | "banned";
export type UserStatus = "active" | "restricted" | "banned";
export type PostStatus = "uploading" | "processing" | "available" | "duplicate" | "rejected" | "hidden";
export type MediaType = "image" | "gif" | "video";

export type UserDTO = {
  id: number;
  publicId: string;
  username: string;
  displayName: string | null;
  rank: UserRank;
  status: UserStatus;
  trustScore: number;
  createdAt: number;
};

export type PostDTO = {
  id: string; // public_id
  author: UserDTO | null;
  mediaType: MediaType;
  status: PostStatus;
  title: string | null;
  score: number;
  favoriteCount: number;
  commentCount: number;
  lowVariantKey: string | null;
  mediumVariantKey: string | null;
  createdAt: number;
  publishedAt: number | null;
  canonicalPostId: number | null;
  tags: string[];
};

export type TagDTO = { id: number; normalizedName: string; displayName: string | null; category: string; usageCount: number };
export type CommentDTO = { id: number; postId: number; author: UserDTO; body: string; parentId: number | null; createdAt: number; status: string };

export type Paginated<T> = { data: T[]; nextCursor: string | null; hasMore: boolean };
export type SearchParams = { tags?: string; sort?: "recent" | "popular"; cursor?: string; limit?: number };
