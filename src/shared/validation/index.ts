import { z } from "zod";

// Validaciones puras — sin dependencia Cloudflare (PLAN 5 Domain)

export const usernameSchema = z
  .string()
  .min(3)
  .max(20)
  .regex(/^[a-z0-9_]+$/, "solo minusculas, numeros y _");

export const tagNormalizedSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/, "tag debe ser minusculas, sin ñ/acentos, espacios como _");

export function normalizeTag(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/ñ/g, "n")
    .replace(/ü/g, "u")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/__+/g, "_");
}

export const postCreateSchema = z.object({
  title: z.string().max(120).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string()).min(1).max(20),
  mediaType: z.enum(["image", "gif", "video"]),
});

export const commentSchema = z.object({
  body: z.string().min(1).max(2000),
  parentId: z.number().int().nullable().optional(),
});

export const ratingSchema = z.object({
  value: z.number().int().min(-5).max(5).refine((v) => v !== 0, "0 no permitido"),
});

export const searchQuerySchema = z.object({
  tags: z.string().max(500).optional(),
  sort: z.enum(["recent", "popular"]).default("recent"),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(60).default(20),
});
