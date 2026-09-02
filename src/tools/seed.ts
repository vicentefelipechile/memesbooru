// =========================================================================================================
// SEED — GENERADOR DE DATOS MOCKUP (v2)
// =========================================================================================================
// Reemplaza migrations/0002_seed_test_data.sql y scripts/seed-scale.*.
// Genera todo el mockup para desarrollo/test sin contaminar migraciones de produccion.
//
// Uso:
//   npx tsx src/tools/seed.ts                          // minimal -> src/tools/seed.sql
//   npx tsx src/tools/seed.ts --minimal --out out.sql  // custom output
//   npx tsx src/tools/seed.ts --scale                  // escala 37k tags + sample posts
//   npx tsx src/tools/seed.ts --minimal --execute      // escribe y ejecuta via wrangler d1 execute
//   npx tsx src/tools/seed.ts --minimal --execute --remote  // contra D1 remoto
//   npx tsx src/tools/seed.ts --help
//
// Idempotente: usa INSERT OR IGNORE / OR REPLACE donde corresponde.
// Deterministico: scale usa PRNG con seed fijo para reproducibilidad.
//
// No importa tipos de Worker (D1Database) para mantenerse ejecutable en Node.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// =========================================================================================================
// Constants
// =========================================================================================================

const DEFAULT_DB = 'memesbooru' as const;
const MINIMAL_USERS = [
	{ id: 1, username: 'admin', display_name: 'Admin', rank: 'trusted', status: 'active', trust_score: 100 },
	{ id: 2, username: 'meme_lord', display_name: 'Meme Lord', rank: 'normal', status: 'active', trust_score: 10 },
	{ id: 3, username: 'nuevo_user', display_name: 'Nuevo', rank: 'new', status: 'active', trust_score: 0 },
	{ id: 4, username: 'neko_artist', display_name: 'Neko Artist', rank: 'normal', status: 'active', trust_score: 25 },
	{ id: 5, username: 'mod_pepe', display_name: 'Mod Pepe', rank: 'trusted', status: 'active', trust_score: 80 },
] as const satisfies readonly { id: number; username: string; display_name: string; rank: string; status: string; trust_score: number }[];

const MINIMAL_TAGS = [
	{ id: 1, normalized_name: 'pepe', display_name: 'Pepe', category: 'character', usage_count: 120 },
	{ id: 2, normalized_name: 'doge', display_name: 'Doge', category: 'character', usage_count: 95 },
	{ id: 3, normalized_name: 'gato_triste', display_name: 'Gato Triste', category: 'general', usage_count: 80 },
	{ id: 4, normalized_name: 'programacion', display_name: 'Programacion', category: 'general', usage_count: 60 },
	{ id: 5, normalized_name: 'reaccion', display_name: 'Reaccion', category: 'general', usage_count: 150 },
	{ id: 6, normalized_name: 'drake', display_name: 'Drake', category: 'general', usage_count: 70 },
	{ id: 7, normalized_name: 'wojak', display_name: 'Wojak', category: 'character', usage_count: 55 },
	{ id: 8, normalized_name: 'chad', display_name: 'Chad', category: 'character', usage_count: 40 },
	{ id: 9, normalized_name: 'distracted_boyfriend', display_name: 'Distracted Boyfriend', category: 'general', usage_count: 65 },
	{ id: 10, normalized_name: 'coffin_dance', display_name: null, category: 'general', usage_count: 30 },
	{ id: 11, normalized_name: 'this_is_fine', display_name: null, category: 'general', usage_count: 45 },
	{ id: 12, normalized_name: 'surprised_pikachu', display_name: null, category: 'character', usage_count: 50 },
] as const;

const FIXED_MINIMAL_TAGS = MINIMAL_TAGS as readonly {
	id: number;
	normalized_name: string;
	display_name: string | null;
	category: string;
	usage_count: number;
}[];

const MINIMAL_ALIASES = [
	{ id: 1, alias_normalized: 'pepe_the_frog', tag_id: 1, created_by: 1 },
	{ id: 2, alias_normalized: 'perro_doge', tag_id: 2, created_by: 1 },
	{ id: 3, alias_normalized: 'gato_llorando', tag_id: 3, created_by: 1 },
	{ id: 4, alias_normalized: 'drake_meme', tag_id: 6, created_by: 5 },
] as const satisfies readonly { id: number; alias_normalized: string; tag_id: number; created_by: number }[];

type MinimalPostSeed = {
	id: number;
	public_id: string;
	author_id: number;
	media_type: 'image' | 'gif' | 'video';
	title: string | null;
	description: string | null;
	score: number;
	rating_count: number;
	favorite_count: number;
	comment_count: number;
	tags: number[];
	published_at_offset_days: number;
	width: number;
	height: number;
};

const MINIMAL_POSTS: readonly MinimalPostSeed[] = [
	{ id: 1, public_id: 'aaaa1111', author_id: 2, media_type: 'image', title: 'Pepe programando a las 3am', description: 'Cuando compilas y funciona a la primera', score: 42.5, rating_count: 12, favorite_count: 30, comment_count: 2, tags: [1, 4, 5], published_at_offset_days: 0, width: 800, height: 600 },
	{ id: 2, public_id: 'bbbb2222', author_id: 2, media_type: 'image', title: 'Doge en la oficina', description: null, score: 35.0, rating_count: 8, favorite_count: 20, comment_count: 1, tags: [2, 5], published_at_offset_days: 1, width: 1024, height: 768 },
	{ id: 3, public_id: 'cccc3333', author_id: 3, media_type: 'gif', title: null, description: 'gato triste vibes', score: 18.0, rating_count: 5, favorite_count: 10, comment_count: 0, tags: [3, 5], published_at_offset_days: 2, width: 400, height: 400 },
	{ id: 4, public_id: 'dddd4444', author_id: 4, media_type: 'image', title: 'Drake decidiendo stack', description: 'JS vs TS', score: 27.3, rating_count: 7, favorite_count: 15, comment_count: 1, tags: [6, 4], published_at_offset_days: 3, width: 900, height: 1200 },
	{ id: 5, public_id: 'eeee5555', author_id: 2, media_type: 'image', title: 'Wojak vs Chad', description: null, score: 55.1, rating_count: 20, favorite_count: 45, comment_count: 3, tags: [7, 8, 5], published_at_offset_days: 4, width: 700, height: 700 },
	{ id: 6, public_id: 'ffff6666', author_id: 3, media_type: 'video', title: 'Coffin dance remix', description: 'video solo visible para trusted', score: 12.0, rating_count: 3, favorite_count: 5, comment_count: 0, tags: [10, 5], published_at_offset_days: 5, width: 1280, height: 720 },
	{ id: 7, public_id: 'gggg7777', author_id: 4, media_type: 'image', title: 'This is fine - deploy viernes', description: null, score: 33.8, rating_count: 9, favorite_count: 18, comment_count: 0, tags: [11, 4], published_at_offset_days: 6, width: 600, height: 400 },
	{ id: 8, public_id: 'hhhh8888', author_id: 2, media_type: 'image', title: 'Surprised Pikachu - code review', description: null, score: 40.0, rating_count: 11, favorite_count: 22, comment_count: 2, tags: [12, 4], published_at_offset_days: 7, width: 800, height: 800 },
	{ id: 9, public_id: 'iiii9999', author_id: 5, media_type: 'image', title: 'Pepe + Doge fusion', description: 'crossover epico', score: 60.0, rating_count: 25, favorite_count: 60, comment_count: 1, tags: [1, 2, 5], published_at_offset_days: 8, width: 1100, height: 800 },
	{ id: 10, public_id: 'jjjj0000', author_id: 2, media_type: 'image', title: null, description: null, score: 5.0, rating_count: 1, favorite_count: 2, comment_count: 0, tags: [1], published_at_offset_days: 9, width: 500, height: 500 },
	{ id: 11, public_id: 'kkkk1112', author_id: 3, media_type: 'gif', title: 'Programacion dolor', description: null, score: 22.4, rating_count: 6, favorite_count: 9, comment_count: 0, tags: [4, 9], published_at_offset_days: 10, width: 320, height: 240 },
	{ id: 12, public_id: 'llll2223', author_id: 4, media_type: 'image', title: 'Gato triste + Pepe', description: null, score: 29.9, rating_count: 7, favorite_count: 13, comment_count: 0, tags: [3, 1], published_at_offset_days: 11, width: 640, height: 640 },
] as const;

const MINIMAL_COMMENTS = [
	{ id: 1, post_id: 1, author_id: 3, parent_id: null, body: 'jajaja me paso ayer', status: 'visible' },
	{ id: 2, post_id: 1, author_id: 4, parent_id: 1, body: 'el mejor meme de programacion', status: 'visible' },
	{ id: 3, post_id: 2, author_id: 1, parent_id: null, body: 'much wow', status: 'visible' },
	{ id: 4, post_id: 5, author_id: 3, parent_id: null, body: 'wojak siempre sufre', status: 'visible' },
	{ id: 5, post_id: 8, author_id: 2, parent_id: null, body: 'esa cara cuando te piden fix en prod', status: 'visible' },
] as const satisfies readonly { id: number; post_id: number; author_id: number; parent_id: number | null; body: string; status: string }[];

// =========================================================================================================
// Helpers
// =========================================================================================================

function escapeSqlText(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function toHex4(n: number): string {
	return n.toString(16).padStart(8, '0');
}

function mulberry32(seed: number): () => number {
	let s = seed;
	return function (): number {
		let t = (s += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function nowUnix(): number {
	return 1_727_000_000;
}

function daysAgo(days: number): number {
	return nowUnix() - days * 86_400;
}

function chunk<T>(arr: readonly T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size) as T[]);
	return out;
}

// =========================================================================================================
// SQL Builders
// =========================================================================================================

export function generateMinimalSql(): string {
	let sql = `-- seed.sql — mockup minimal para dev/test (generado ${new Date().toISOString()})\n`;
	sql += `-- Generado por src/tools/seed.ts — no usar en migraciones de produccion.\n`;
	sql += `-- Idempotente: INSERT OR IGNORE / REPLACE. Ejecutar con: wrangler d1 execute ${DEFAULT_DB} --local --file=src/tools/seed.sql\n\n`;
	sql += `PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n\n`;

	// Users
	sql += `-- Users (${MINIMAL_USERS.length})\n`;
	for (const u of MINIMAL_USERS) {
		sql += `INSERT OR IGNORE INTO users (id, username, display_name, rank, status, trust_score, created_at) VALUES (${u.id}, ${escapeSqlText(u.username)}, ${u.display_name ? escapeSqlText(u.display_name) : 'NULL'}, ${escapeSqlText(u.rank)}, ${escapeSqlText(u.status)}, ${u.trust_score}, ${nowUnix()});\n`;
	}
	// User activity
	sql += `\n-- User activity\n`;
	for (const u of MINIMAL_USERS) {
		sql += `INSERT OR IGNORE INTO user_activity (user_id, approved_posts, rejected_posts, comments_count, confirmed_reports, updated_at) VALUES (${u.id}, ${u.id === 2 ? 8 : 0}, 0, ${MINIMAL_COMMENTS.filter((c) => c.author_id === u.id).length}, 0, ${nowUnix()});\n`;
	}

	// Tags
	sql += `\n-- Tags (${FIXED_MINIMAL_TAGS.length})\n`;
	for (const t of FIXED_MINIMAL_TAGS) {
		const display = t.display_name ? escapeSqlText(t.display_name) : 'NULL';
		const by = 1;
		sql += `INSERT OR IGNORE INTO tags (id, normalized_name, display_name, category, usage_count, status, created_by, created_at, updated_at) VALUES (${t.id}, ${escapeSqlText(t.normalized_name)}, ${display}, ${escapeSqlText(t.category)}, ${t.usage_count}, 'active', ${by}, ${nowUnix()}, ${nowUnix()});\n`;
	}

	// Aliases
	sql += `\n-- Tag aliases (${MINIMAL_ALIASES.length})\n`;
	for (const a of MINIMAL_ALIASES) {
		sql += `INSERT OR IGNORE INTO tag_aliases (id, alias_normalized, tag_id, created_by, created_at) VALUES (${a.id}, ${escapeSqlText(a.alias_normalized)}, ${a.tag_id}, ${a.created_by}, ${nowUnix()});\n`;
	}

	// Posts + post_listing + media_assets + media_variants + post_tags
	sql += `\n-- Posts / post_listing / media\n`;
	for (const p of MINIMAL_POSTS) {
		const title = p.title ? escapeSqlText(p.title) : 'NULL';
		const desc = p.description ? escapeSqlText(p.description) : 'NULL';
		const published = daysAgo(p.published_at_offset_days);
		const created = published - 3600;
		const lowKey = `media/${p.public_id}/low.avif`;
		const medKey = `media/${p.public_id}/medium.avif`;
		const origKey = `media/${p.public_id}/original`;
		const mime = p.media_type === 'video' ? 'video/mp4' : p.media_type === 'gif' ? 'image/gif' : 'image/jpeg';
		const checksum = `X'${toHex4(p.id)}${toHex4(p.id * 31)}${toHex4(p.id * 131)}${toHex4(p.id * 7919)}'`;
		sql += `INSERT OR IGNORE INTO posts (id, public_id, author_id, media_type, status, title, description, score, rating_count, favorite_count, comment_count, created_at, published_at, updated_at) VALUES (${p.id}, ${escapeSqlText(p.public_id)}, ${p.author_id}, ${escapeSqlText(p.media_type)}, 'available', ${title}, ${desc}, ${p.score}, ${p.rating_count}, ${p.favorite_count}, ${p.comment_count}, ${created}, ${published}, ${published});\n`;
		sql += `INSERT OR IGNORE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, width, height, score, rating_count, favorite_count, comment_count, published_at) VALUES (${p.id}, ${escapeSqlText(p.public_id)}, ${escapeSqlText(p.media_type)}, 'available', ${escapeSqlText(lowKey)}, ${escapeSqlText(medKey)}, ${p.width}, ${p.height}, ${p.score}, ${p.rating_count}, ${p.favorite_count}, ${p.comment_count}, ${published});\n`;
		sql += `INSERT OR IGNORE INTO media_assets (id, post_id, media_type, provider, original_object_key, mime_type, byte_size, width, height, checksum, processing_status, created_at) VALUES (${p.id}, ${p.id}, ${escapeSqlText(p.media_type)}, 'r2', ${escapeSqlText(origKey)}, ${escapeSqlText(mime)}, ${800_000 + p.id * 1234}, ${p.width}, ${p.height}, ${checksum}, 'done', ${created});\n`;
		sql += `INSERT OR IGNORE INTO media_variants (id, media_asset_id, variant_name, object_key, mime_type, byte_size, width, height, quality_class, visibility, created_at) VALUES (${p.id * 10 + 1}, ${p.id}, 'low', ${escapeSqlText(lowKey)}, 'image/avif', ${45_000 + p.id * 100}, ${Math.round(p.width * 0.25)}, ${Math.round(p.height * 0.25)}, 'low', 'public', ${published});\n`;
		sql += `INSERT OR IGNORE INTO media_variants (id, media_asset_id, variant_name, object_key, mime_type, byte_size, width, height, quality_class, visibility, created_at) VALUES (${p.id * 10 + 2}, ${p.id}, 'medium', ${escapeSqlText(medKey)}, 'image/avif', ${120_000 + p.id * 200}, ${Math.round(p.width * 0.5)}, ${Math.round(p.height * 0.5)}, 'medium', 'public', ${published});\n`;
		sql += `INSERT OR IGNORE INTO media_variants (id, media_asset_id, variant_name, object_key, mime_type, byte_size, width, height, quality_class, visibility, created_at) VALUES (${p.id * 10 + 3}, ${p.id}, 'original', ${escapeSqlText(origKey)}, ${escapeSqlText(mime)}, ${800_000 + p.id * 1234}, ${p.width}, ${p.height}, 'original', 'public', ${created});\n`;
	}

	// Post Tags
	sql += `\n-- Post tags\n`;
	for (const p of MINIMAL_POSTS) {
		for (const tagId of p.tags) {
			sql += `INSERT OR IGNORE INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (${p.id}, ${tagId}, ${p.author_id}, ${daysAgo(p.published_at_offset_days)});\n`;
		}
	}

	// Comments
	sql += `\n-- Comments (${MINIMAL_COMMENTS.length})\n`;
	for (const c of MINIMAL_COMMENTS) {
		const parent = c.parent_id === null ? 'NULL' : String(c.parent_id);
		sql += `INSERT OR IGNORE INTO comments (id, post_id, author_id, parent_id, body, status, created_at, updated_at) VALUES (${c.id}, ${c.post_id}, ${c.author_id}, ${parent}, ${escapeSqlText(c.body)}, ${escapeSqlText(c.status)}, ${daysAgo(0)}, ${daysAgo(0)});\n`;
	}

	// Ratings / favorites de ejemplo
	sql += `\n-- Sample ratings / favorites\n`;
	sql += `INSERT OR IGNORE INTO post_ratings (post_id, user_id, value, created_at, updated_at) VALUES (1, 3, 5, ${nowUnix()}, ${nowUnix()});\n`;
	sql += `INSERT OR IGNORE INTO post_ratings (post_id, user_id, value, created_at, updated_at) VALUES (1, 4, 4, ${nowUnix()}, ${nowUnix()});\n`;
	sql += `INSERT OR IGNORE INTO post_ratings (post_id, user_id, value, created_at, updated_at) VALUES (5, 2, 5, ${nowUnix()}, ${nowUnix()});\n`;
	sql += `INSERT OR IGNORE INTO post_favorites (post_id, user_id, created_at) VALUES (1, 3, ${nowUnix()});\n`;
	sql += `INSERT OR IGNORE INTO post_favorites (post_id, user_id, created_at) VALUES (5, 2, ${nowUnix()});\n`;
	sql += `INSERT OR IGNORE INTO post_favorites (post_id, user_id, created_at) VALUES (5, 3, ${nowUnix()});\n`;

	sql += `\nCOMMIT;\nPRAGMA foreign_keys = ON;\n`;
	return sql;
}

export type ScaleOptions = {
	tagCount: number;
	postCount: number;
	tagsPerPost: number;
	seed: number;
	batchSize: number;
};

const DEFAULT_SCALE_OPTIONS = {
	tagCount: 37_000,
	postCount: 1_500_000,
	tagsPerPost: 10,
	seed: 0x2a,
	batchSize: 500,
} as const satisfies ScaleOptions;

export function generateScaleSql(opts: Partial<ScaleOptions> = {}): string {
	const o: ScaleOptions = { ...DEFAULT_SCALE_OPTIONS, ...opts };
	const rand = mulberry32(o.seed);
	const startTagId = FIXED_MINIMAL_TAGS.length + 1;

	function randTagName(i: number): string {
		const suffix = Math.floor(rand() * 0xffff).toString(36).padStart(4, '0');
		return `tag_${String(i).padStart(5, '0')}_${suffix}`;
	}

	let sql = `-- seed-scale.sql — escala sintetica (generado ${new Date().toISOString()})\n`;
	sql += `-- opts: tags=${o.tagCount} posts=${o.postCount} tagsPerPost=${o.tagsPerPost} seed=${o.seed}\n`;
	sql += `-- Incluye minimal (${FIXED_MINIMAL_TAGS.length} tags base) + ${o.tagCount - FIXED_MINIMAL_TAGS.length} sinteticos.\n`;
	sql += `-- Para no generar un archivo de 15M lineas en demo, por defecto se emiten solo los tags.\n`;
	sql += `-- Para el flujo completo de posts usar --full (requiere streaming a disco y D1 batch).\n`;
	sql += `PRAGMA foreign_keys = OFF;\nBEGIN TRANSACTION;\n\n`;

	// Tags sinteticos en batches
	const batches = chunk(
		Array.from({ length: o.tagCount - FIXED_MINIMAL_TAGS.length }, (_, idx) => {
			const id = startTagId + idx;
			const name = randTagName(id);
			const usage = Math.floor(rand() * 500);
			return `(${id}, ${escapeSqlText(name)}, NULL, 'general', ${usage}, 'active', 1, ${nowUnix()}, ${nowUnix()})`;
		}),
		o.batchSize,
	);

	for (const batch of batches) {
		sql += `INSERT OR IGNORE INTO tags (id, normalized_name, display_name, category, usage_count, status, created_by, created_at, updated_at) VALUES\n${batch.join(',\n')};\n`;
	}

	sql += `\n-- NOTA: generacion completa de ${o.postCount} posts + ${o.postCount * o.tagsPerPost} post_tags se hace en streaming.\n`;
	sql += `-- Ver src/tools/seed.ts:generateScalePostBatches() para batches de posts con D1.\n`;
	sql += `COMMIT;\nPRAGMA foreign_keys = ON;\n`;
	return sql;
}

export function* generateScalePostBatches(opts: Partial<ScaleOptions> = {}): Generator<string, void, unknown> {
	const o: ScaleOptions = { ...DEFAULT_SCALE_OPTIONS, ...opts };
	const rand = mulberry32(o.seed + 1);
	const startPostId = MINIMAL_POSTS.length + 1;

	for (let batchStart = startPostId; batchStart < startPostId + o.postCount; batchStart += o.batchSize) {
		const batchEnd = Math.min(batchStart + o.batchSize, startPostId + o.postCount);
		let sql = `BEGIN TRANSACTION;\n`;
		for (let pid = batchStart; pid < batchEnd; pid++) {
			const author = 1 + Math.floor(rand() * MINIMAL_USERS.length);
			const mediaPick = rand();
			const mediaType: MinimalPostSeed['media_type'] = mediaPick < 0.8 ? 'image' : mediaPick < 0.95 ? 'gif' : 'video';
			const score = Math.round(rand() * 100 * 10) / 10;
			const pub = nowUnix() - Math.floor(rand() * 30 * 86_400);
			const pubId = `p${String(pid).padStart(7, '0')}`;
			const lowKey = `media/${pubId}/low.avif`;
			const medKey = `media/${pubId}/medium.avif`;
			const origKey = `media/${pubId}/original`;
			const mime = mediaType === 'video' ? 'video/mp4' : mediaType === 'gif' ? 'image/gif' : 'image/jpeg';
			const checksum = `X'${toHex4(pid)}${toHex4(pid * 31)}${toHex4(pid * 131)}${toHex4(pid * 7919)}'`;
			const w = 400 + Math.floor(rand() * 800);
			const h = 400 + Math.floor(rand() * 800);
			sql += `INSERT OR IGNORE INTO posts (id, public_id, author_id, media_type, status, score, rating_count, favorite_count, comment_count, created_at, published_at, updated_at) VALUES (${pid}, ${escapeSqlText(pubId)}, ${author}, ${escapeSqlText(mediaType)}, 'available', ${score}, 0, 0, 0, ${pub - 3600}, ${pub}, ${pub});\n`;
			sql += `INSERT OR IGNORE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, width, height, score, rating_count, favorite_count, comment_count, published_at) VALUES (${pid}, ${escapeSqlText(pubId)}, ${escapeSqlText(mediaType)}, 'available', ${escapeSqlText(lowKey)}, ${escapeSqlText(medKey)}, ${w}, ${h}, ${score}, 0, 0, 0, ${pub});\n`;
			sql += `INSERT OR IGNORE INTO media_assets (id, post_id, media_type, provider, original_object_key, mime_type, byte_size, width, height, checksum, processing_status, created_at) VALUES (${pid}, ${pid}, ${escapeSqlText(mediaType)}, 'r2', ${escapeSqlText(origKey)}, ${escapeSqlText(mime)}, ${800_000}, ${w}, ${h}, ${checksum}, 'done', ${pub - 3600});\n`;
			// post_tags para este post
			const used = new Set<number>();
			for (let k = 0; k < o.tagsPerPost; k++) {
				let tagId: number;
				do {
					tagId = 1 + Math.floor(rand() * o.tagCount);
				} while (used.has(tagId));
				used.add(tagId);
				sql += `INSERT OR IGNORE INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (${pid}, ${tagId}, ${author}, ${pub});\n`;
			}
		}
		sql += `COMMIT;\n`;
		yield sql;
	}
}

// =========================================================================================================
// CLI
// =========================================================================================================

type CliArgs = {
	help: boolean;
	minimal: boolean;
	scale: boolean;
	full: boolean;
	out: string | null;
	execute: boolean;
	remote: boolean;
	db: string;
	yes: boolean;
	tagCount: number | null;
	postCount: number | null;
};

function parseArgs(argv: readonly string[]): CliArgs {
	const args: CliArgs = { help: false, minimal: false, scale: false, full: false, out: null, execute: false, remote: false, db: DEFAULT_DB, yes: false, tagCount: null, postCount: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i] as string;
		if (a === '--help' || a === '-h') args.help = true;
		else if (a === '--minimal') args.minimal = true;
		else if (a === '--scale') args.scale = true;
		else if (a === '--full') args.full = true;
		else if (a === '--execute') args.execute = true;
		else if (a === '--remote') args.remote = true;
		else if (a === '--local') args.remote = false;
		else if (a === '--yes' || a === '-y') args.yes = true;
		else if (a === '--out' && argv[i + 1]) { args.out = argv[++i] as string; }
		else if (a.startsWith('--out=')) args.out = a.slice('--out='.length);
		else if (a === '--db' && argv[i + 1]) { args.db = argv[++i] as string; }
		else if (a.startsWith('--db=')) args.db = a.slice('--db='.length);
		else if (a === '--tags' && argv[i + 1]) { args.tagCount = Number(argv[++i]); }
		else if (a.startsWith('--tags=')) args.tagCount = Number(a.slice('--tags='.length));
		else if (a === '--posts' && argv[i + 1]) { args.postCount = Number(argv[++i]); }
		else if (a.startsWith('--posts=')) args.postCount = Number(a.slice('--posts='.length));
	}
	if (!args.minimal && !args.scale) args.minimal = true;
	return args;
}

function printHelp(): void {
	console.log(`seed.ts — generador de mockup Memesbooru

Uso:
  npx tsx src/tools/seed.ts [opciones]

Opciones:
  --minimal            Genera dataset minimal (default, 12 posts, 12 tags, 4 aliases)
  --scale              Genera dataset a escala (37k tags por defecto, sin posts a menos que --full)
  --full               Con --scale, genera tambien posts en batches (streaming)
  --out <file>         Ruta de salida (.sql). Default: src/tools/seed.sql (minimal) o src/tools/seed-scale.sql (scale)
  --execute            Tras generar, ejecuta wrangler d1 execute <db> --file=<out>
  --local / --remote   Destino D1 para --execute (default --local)
  --db <name>          Nombre D1 (default ${DEFAULT_DB})
  --tags <n>           Override tagCount para --scale
  --posts <n>          Override postCount para --scale --full
  --yes, -y            No pide confirmacion para --execute --remote
  --help, -h           Muestra esta ayuda

Ejemplos:
  npx tsx src/tools/seed.ts --minimal --out src/tools/seed.sql --execute
  npx tsx src/tools/seed.ts --scale --tags 37000 --out src/tools/seed-scale.sql
  npx tsx src/tools/seed.ts --scale --full --posts 1000 --execute --local

Notas:
  - Este script NO es una migracion. No se despliega a produccion automaticamente.
  - Ejecutar solo en dev/test o en D1 local: wrangler d1 execute ${DEFAULT_DB} --local --file=...
  - Ficheros bajo src/tools/ son herramientas, no parte del Worker runtime.
`);
}

function ensureDir(filePath: string): void {
	mkdirSync(dirname(resolve(filePath)), { recursive: true });
}

function runWrangler(file: string, db: string, remote: boolean): number {
	const args = ['d1', 'execute', db, `--file=${file}`];
	if (!remote) args.push('--local');
	else args.push('--remote');
	console.log(`> wrangler ${args.join(' ')}`);
	const res = spawnSync('npx', ['wrangler', ...args], { stdio: 'inherit', shell: false });
	if (res.status === null) {
		console.error('No se pudo ejecutar wrangler. Instala wrangler localmente (npm i -D wrangler).');
		return 1;
	}
	return res.status ?? 1;
}

function main(): void {
	const cli = parseArgs(process.argv.slice(2));

	if (cli.help) {
		printHelp();
		process.exit(0);
	}

	const isScale = cli.scale;

	if (isScale) {
		const out = cli.out ?? 'src/tools/seed-scale.sql';
		const tagCount = cli.tagCount ?? DEFAULT_SCALE_OPTIONS.tagCount;
		const postCount = cli.postCount ?? DEFAULT_SCALE_OPTIONS.postCount;
		const sql = generateScaleSql({ tagCount, postCount });
		ensureDir(out);
		writeFileSync(out, sql, 'utf8');
		console.log(`Escala: tags=${tagCount} -> ${out} (${(sql.length / 1024).toFixed(1)} KiB)`);

		if (cli.full) {
			const batchesOut = out.replace(/\.sql$/, '.posts.sql');
			// Para no saturar memoria con 1.5M, escribimos streaming si postCount es manejable; sino avisamos.
			if (postCount > 10_000) {
				console.log(`--full con ${postCount} posts generaria un archivo enorme. Usa --posts 1000 para demo o implementa streaming a disco.`);
				console.log(`Demo: generando 10 batches de ejemplo en ${batchesOut}.preview.sql`);
				let preview = `-- preview posts (10 batches x ${DEFAULT_SCALE_OPTIONS.batchSize}) — generado ${new Date().toISOString()}\n`;
				let count = 0;
				for (const batch of generateScalePostBatches({ tagCount, postCount: Math.min(postCount, 10 * DEFAULT_SCALE_OPTIONS.batchSize) })) {
					preview += batch;
					if (++count >= 10) break;
				}
				writeFileSync(`${batchesOut}.preview.sql`, preview, 'utf8');
				console.log(`Preview escrito: ${batchesOut}.preview.sql`);
			} else {
				let full = `-- posts a escalafull — generado ${new Date().toISOString()}\n`;
				for (const batch of generateScalePostBatches({ tagCount, postCount })) full += batch;
				writeFileSync(batchesOut, full, 'utf8');
				console.log(`Posts escala escritos: ${batchesOut}`);
			}
		}

		if (cli.execute) {
			if (cli.remote && !cli.yes) {
				console.error('Rehusando --execute --remote sin --yes (proteccion). Anade --yes para confirmar.');
				process.exit(1);
			}
			const code = runWrangler(out, cli.db, cli.remote);
			process.exit(code);
		}
	} else {
		const out = cli.out ?? 'src/tools/seed.sql';
		const sql = generateMinimalSql();
		ensureDir(out);
		writeFileSync(out, sql, 'utf8');
		console.log(`Minimal: ${MINIMAL_USERS.length} users, ${FIXED_MINIMAL_TAGS.length} tags, ${MINIMAL_POSTS.length} posts -> ${out} (${(sql.length / 1024).toFixed(1)} KiB)`);

		if (cli.execute) {
			if (cli.remote && !cli.yes) {
				console.error('Rehusando --execute --remote sin --yes (proteccion). Anade --yes para confirmar.');
				process.exit(1);
			}
			const code = runWrangler(out, cli.db, cli.remote);
			process.exit(code);
		}
		console.log(`Siguiente: wrangler d1 execute ${cli.db} --local --file=${out}`);
	}
}

const isMain = process.argv[1] !== undefined && process.argv[1].replace(/\\/g, '/').endsWith('seed.ts');
if (isMain) main();
