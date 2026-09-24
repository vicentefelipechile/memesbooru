// =========================================================================================================
// Search integration: real D1 joins, exclusions, aliases and contextual page tags.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import initialSql from '../../migrations/0001_initial.sql?raw';
import communitySql from '../../migrations/0004_community_entities.sql?raw';
import tagDescriptionsSql from '../../migrations/0005_tag_descriptions.sql?raw';
import { PostService } from '../../src/services/post-service';
import { TagService } from '../../src/services/tag-service';
import { CommunityService } from '../../src/services/community-service';
import { toUserId } from '../../src/types';
import { SearchQuerySchema, TagDisplayNameSchema } from '../../src/validators';

beforeAll(async () => {
	const statements = `${initialSql}\n${communitySql}\n${tagDescriptionsSql}`
		.replace(/--[^\n]*/g, '')
		.split(';')
		.map((sql) => sql.trim())
		.filter(Boolean);
	await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
	await env.DB.prepare("INSERT INTO users (id, username, created_at) VALUES (1, 'tester', 1)").run();
	await env.DB.batch([
		env.DB.prepare("INSERT INTO tags (id, normalized_name, category, usage_count, created_at, updated_at) VALUES (1, 'dog', 'character', 3, 1, 1), (2, 'falling', 'meta', 1, 1, 1), (3, 'cat', 'character', 1, 1, 1)"),
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
		const user = { id: toUserId(1), username: 'tester', rank: 'trusted', status: 'active', isAdmin: false } as const;
		const tags = new TagService(env.DB);

		await expect(tags.resolveId('DOG')).resolves.toBe(1);
		await expect(tags.resolveId('missing')).rejects.toThrow('Tag no encontrado');
		await tags.addAlias('canine', 'dog', user);
		await new CommunityService(env.DB).createWiki(user, 'dog', 'Dog', 'A meme tag');

		expect((await tags.listAliases()).find((alias) => alias.alias_normalized === 'canine')?.normalized_name).toBe('dog');
		expect((await new CommunityService(env.DB).listWiki()).find((page) => page.title === 'Dog')?.normalized_name).toBe('dog');
	});

	it('accepts meme-style tag names, rejects free text, and preserves descriptions', async () => {
		for (const name of ['curitoons', 'carl_jhonson_(personaje)', 'cj_(personaje)']) expect(TagDisplayNameSchema.safeParse(name).success).toBe(true);
		for (const name of ['asdasd asdas', 'Pepe', 'tag-evil', 'tag__broken', 'tag_(bad space)']) expect(TagDisplayNameSchema.safeParse(name).success).toBe(false);

		const user = { id: toUserId(1), username: 'tester', rank: 'trusted', status: 'active', isAdmin: false } as const;
		await env.DB.prepare("UPDATE tags SET description = 'existing description' WHERE id = 1").run();
		await new TagService(env.DB).update(1, 'cj_(personaje)', undefined, 'character', user);
		expect(await env.DB.prepare('SELECT display_name, description FROM tags WHERE id = 1').first()).toMatchObject({ display_name: 'cj_(personaje)', description: 'existing description' });
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
