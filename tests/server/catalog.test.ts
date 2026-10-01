// =========================================================================================================
// Search integration: real D1 joins, exclusions, aliases and contextual page tags.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { PostService } from '../../src/services/post-service';
import { TagService } from '../../src/services/tag-service';
import { TagRepository } from '../../src/repositories/tag-repository';
import { ConflictError, ForbiddenError } from '../../src/domain/errors';
import { CommunityService } from '../../src/services/community-service';
import { hashToken } from '../../src/helpers/crypto';
import worker from '../../src/index';
import { toUserId } from '../../src/types';
import { SearchQuerySchema, TagDirectoryResponseSchema, TagDisplayNameSchema } from '../../src/validators';
import { applySchema } from './apply-schema';

beforeAll(async () => {
	await applySchema(env.DB);
	await env.DB.prepare("INSERT INTO users (id, username, created_at) VALUES (1, 'tester', 1)").run();
	await env.DB.batch([
		env.DB.prepare("INSERT INTO tags (id, normalized_name, category, created_at, updated_at) VALUES (1, 'dog', 'character', 1, 1), (2, 'falling', 'meta', 1, 1), (3, 'cat', 'character', 1, 1)"),
		env.DB.prepare("INSERT INTO tag_aliases (id, alias_normalized, tag_id, created_by, created_at) VALUES (1, 'puppy', 1, 1, 1)"),
	]);
	for (let id = 1; id <= 4; id++) {
		await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (?, ?, 1, 'image', 'available', 1, 1)").bind(id, `meme${id}`).run();
		await env.DB.prepare("INSERT INTO post_listing (post_id, public_id, media_type, status, low_variant_key, score, published_at) VALUES (?, ?, 'image', 'available', 'low', ?, ?)")
			.bind(id, `meme${id}`, 5 - id, id)
			.run();
	}
	await env.DB.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (1, 1, 1, 1), (2, 1, 1, 1), (2, 2, 1, 1), (3, 3, 1, 1), (4, 1, 1, 1)').run();
});

describe('contextual catalog', () => {
	const search = (tags = '', cursor?: string, sort: 'recent' | 'popular' = 'recent', limit = 1) => new PostService(env.DB).search({ tags, cursor, sort, limit });

	it('returns only the visible page tags, not the lookahead or global tags', async () => {
		const first = await search();
		expect(first.data.map((post) => post.public_id)).toEqual(['meme4']);
		expect(first.tags).toEqual([{ name: 'dog', category: 'character', count: 3 }]);
		const second = await search('', first.nextCursor!);
		expect(second.data.map((post) => post.public_id)).toEqual(['meme3']);
		expect(second.tags.map((tag) => tag.name)).toEqual(['cat']);
	});

	it('intersects positives, excludes negatives and resolves duplicate aliases', async () => {
		expect((await search('dog falling')).data.map((post) => post.public_id)).toEqual(['meme2']);
		expect((await search('dog -falling', undefined, 'recent', 10)).data.map((post) => post.public_id)).toEqual(['meme4', 'meme1']);
		expect((await search('dog puppy', undefined, 'recent', 10)).data).toHaveLength(3);
		expect((await search('-dog', undefined, 'recent', 10)).data.map((post) => post.public_id)).toEqual(['meme3']);
	});

	it('does not ignore unknown positive tags or advertise an empty next page', async () => {
		expect(await search('dog nonexistent')).toEqual({ data: [], tags: [], nextCursor: null, hasMore: false });
		const result = await search('dog -nonexistent', undefined, 'popular', 3);
		expect(result.data.map((post) => post.public_id)).toEqual(['meme1', 'meme2', 'meme4']);
		expect(result.hasMore).toBe(false);
		expect(result.nextCursor).toBeNull();
	});

	it('validates repeated tags, term limits and cursor payloads', async () => {
		expect(SearchQuerySchema.parse({ tags: ['dog', '-falling'] }).tags).toBe('dog -falling');
		expect(SearchQuerySchema.safeParse({ tags: Array(41).fill('dog') }).success).toBe(false);
		expect(SearchQuerySchema.safeParse({ tags: '-' }).success).toBe(false);
		await expect(search('', btoa('null'))).rejects.toThrow('Invalid search cursor');
	});

	it('resolves tag names for aliases and wiki creation without numeric input', async () => {
		const user = { id: toUserId(1), username: 'tester', permissions: ['edit_tags', 'edit_wiki'] as const, status: 'active' } as const;
		const tags = new TagService(env.DB);

		await expect(tags.resolveId('DOG')).resolves.toBe(1);
		await expect(tags.resolveId('missing')).rejects.toThrow('Tag no encontrado');
		await tags.addAlias('canine', 'dog', user);
		await new CommunityService(env.DB).createWiki(user, 'dog', 'Dog', 'A meme tag');

		expect((await tags.listAliases()).data.find((alias) => alias.alias_normalized === 'canine')?.normalized_name).toBe('dog');
		expect((await new CommunityService(env.DB).listWiki()).find((page) => page.title === 'Dog')?.normalized_name).toBe('dog');
	});

	it('accepts meme-style tag names, rejects free text, and preserves descriptions', async () => {
		for (const name of ['curitoons', 'carl_jhonson_(personaje)', 'cj_(personaje)']) expect(TagDisplayNameSchema.safeParse(name).success).toBe(true);
		for (const name of ['asdasd asdas', 'Pepe', 'tag-evil', 'tag__broken', 'tag_(bad space)']) expect(TagDisplayNameSchema.safeParse(name).success).toBe(false);

		const user = { id: toUserId(1), username: 'tester', permissions: ['edit_tags'] as const, status: 'active' } as const;
		await env.DB.prepare("UPDATE tags SET description = 'existing description' WHERE id = 1").run();
		await new TagService(env.DB).update(1, 'cj_(personaje)', undefined, 'character', user);
		expect(await env.DB.prepare('SELECT display_name, description FROM tags WHERE id = 1').first()).toMatchObject({ display_name: 'cj_(personaje)', description: 'existing description' });
	});

	it('normalizes aliases, deduplicates uploads and maintains one name namespace', async () => {
		const user = { id: toUserId(1), username: 'tester', permissions: ['edit_tags'] as const, status: 'active' } as const;
		const service = new TagService(env.DB);
		await service.addAlias('Pup-py', 'dog', user);
		const repo = new TagRepository(env.DB);
		expect(await repo.ensureTags(['pup_py', 'dog', 'dog'], 1)).toEqual([1]);
		expect((await repo.autocomplete('pup_')).map((tag) => tag.normalized_name)).toContain('dog');
		expect((await service.listAliases()).data.find((row) => row.alias_normalized === 'pup_py')?.normalized_name).toBe('dog');
		await expect(service.addAlias('cat', 'dog', user)).rejects.toBeInstanceOf(ConflictError);
		await expect(service.create('puppy', null, null, 'character', user)).rejects.toBeInstanceOf(ConflictError);
		const created = await service.create('Nuevo Tag', null, 'New', 'meta', user);
		expect(await service.resolveId('nuevo_tag')).toBe(created.id);
		expect((await service.list(10, undefined, 'nuevo', 'meta')).data.map((tag) => tag.id)).toEqual([created.id]);
		expect((await service.list(10, undefined, 'nuevo', 'reaction')).data).toEqual([]);
		const alias = (await service.listAliases()).data.find((row) => row.alias_normalized === 'pup_py')!;
		await service.updateAlias(alias.id, 'Felino', 'cat', user);
		expect(await service.resolveId('felino')).toBe(3);
		await service.deleteAlias(alias.id, user);
		await expect(service.resolveId('felino')).rejects.toThrow('Tag no encontrado');
	});

	it('returns domain error statuses for invalid and conflicting tag creation', async () => {
		await env.DB.prepare('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (1, 2)').run();
		await env.DB.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (1, ?, ?, ?, ?)')
			.bind(await hashToken('tag-session'), Date.now(), Date.now() + 60_000, Date.now())
			.run();
		const create = (name: string) =>
			worker.fetch(new Request('http://localhost/api/tags', { method: 'POST', headers: { host: 'localhost', cookie: 'session=tag-session', 'content-type': 'application/json' }, body: JSON.stringify({ name, category: 'reaction' }) }), env);
		expect((await create('dog')).status).toBe(409);
		expect((await create('---')).status).toBe(400);
		expect((await create('http_tag')).status).toBe(201);
		const listing = await worker.fetch(new Request('http://localhost/api/tags?q=http', { headers: { host: 'localhost' } }), env);
		expect(listing.status).toBe(200);
		expect(TagDirectoryResponseSchema.safeParse(await listing.json()).success).toBe(true);
		expect((await worker.fetch(new Request('http://localhost/api/tags/aliases/999', { headers: { host: 'localhost' } }), env)).status).toBe(404);
	});

	it('counts only available post tags across publication, editing and moderation', async () => {
		await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (1000, 'pending', 1, 'image', 'processing', 1, 1)").run();
		await env.DB.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (1000, 1, 1, 1)').run();
		const count = async () => (await env.DB.prepare('SELECT usage_count FROM tags WHERE id = 1').first<{ usage_count: number }>())!.usage_count;
		expect(await count()).toBe(3);
		await env.DB.prepare("UPDATE posts SET status = 'available' WHERE id = 1000").run();
		expect(await count()).toBe(4);
		await env.DB.prepare("UPDATE posts SET status = 'hidden' WHERE id = 1000").run();
		expect(await count()).toBe(3);
		const owner = { id: toUserId(1), username: 'tester', permissions: [] as const, status: 'active' } as const;
		await new PostService(env.DB).replaceTags(owner, 'meme1', ['cat', 'cat']);
		expect(await search('cat', undefined, 'recent', 10)).toMatchObject({ hasMore: false });
		expect((await search('cat', undefined, 'recent', 10)).data.map((row) => row.public_id)).toContain('meme1');
		await expect(new PostService(env.DB).replaceTags({ ...owner, id: toUserId(2) }, 'meme1', ['dog'])).rejects.toBeInstanceOf(ForbiddenError);
		await new PostService(env.DB).replaceTags(owner, 'meme1', ['dog']);
	});

	it('does not discard older popular posts beyond 500 tag candidates', async () => {
		await env.DB.prepare(
			`WITH RECURSIVE ids(id) AS (SELECT 5 UNION ALL SELECT id + 1 FROM ids WHERE id < 505)
			INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at)
			SELECT id, 'meme' || id, 1, 'image', 'available', 1, 1 FROM ids`,
		).run();
		await env.DB.prepare(
			`INSERT INTO post_listing (post_id, public_id, media_type, status, low_variant_key, score, published_at)
			SELECT id, public_id, media_type, status, 'low', 0, id FROM posts WHERE id >= 5`,
		).run();
		await env.DB.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) SELECT id, 1, 1, 1 FROM posts WHERE id >= 5').run();
		expect((await search('dog', undefined, 'popular')).data[0].public_id).toBe('meme1');
	});
});
