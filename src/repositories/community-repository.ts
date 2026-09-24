// =========================================================================================================
// COMMUNITY REPOSITORY
// =========================================================================================================
// Read and write access for artists, pools, forum topics and wiki pages.
// =========================================================================================================

import { execute, queryAll, queryOne, type DB } from '../db/client';
import type { ArtistRow, ContactTicketRow, ForumPostRow, ForumTopicRow, MailMessageRow, PoolRow, TagRow, WikiPageRow, WikiRevisionRow } from '../db/schema';

export class CommunityRepository {
	constructor(private readonly db: DB) {}

	listArtists(limit: number): Promise<ArtistRow[]> {
		return queryAll<ArtistRow>(this.db, "SELECT id, name, normalized_name, status, updated_by, created_at, updated_at FROM artists WHERE status = 'active' ORDER BY normalized_name, id LIMIT ?", [limit]);
	}

	listPools(limit: number): Promise<PoolRow[]> {
		return queryAll<PoolRow>(this.db, "SELECT id, public_id, name, description, creator_id, visibility, created_at, updated_at FROM pools WHERE visibility = 'public' ORDER BY updated_at DESC, id DESC LIMIT ?", [limit]);
	}

	getPool(id: number): Promise<PoolRow | null> {
		return queryOne<PoolRow>(this.db, 'SELECT id, public_id, name, description, creator_id, visibility, created_at, updated_at FROM pools WHERE id = ?', [id]);
	}

	listTopics(limit: number): Promise<ForumTopicRow[]> {
		return queryAll<ForumTopicRow>(
			this.db,
			"SELECT id, category_id, author_id, title, status, is_pinned, reply_count, last_post_at, last_author_id, created_at, updated_at FROM forum_topics WHERE status != 'hidden' ORDER BY is_pinned DESC, last_post_at DESC, id DESC LIMIT ?",
			[limit],
		);
	}

	listCategories(): Promise<{ id: number; name: string; description: string | null; position: number }[]> {
		return queryAll(this.db, "SELECT id, name, description, position FROM forum_categories WHERE status = 'visible' ORDER BY position, id", []);
	}

	listWiki(limit: number): Promise<(WikiPageRow & Pick<TagRow, 'normalized_name'>)[]> {
		return queryAll<WikiPageRow & Pick<TagRow, 'normalized_name'>>(
			this.db,
			"SELECT w.id, w.tag_id, w.title, w.current_revision_id, w.status, w.created_by, w.created_at, w.updated_at, t.normalized_name FROM wiki_pages w JOIN tags t ON t.id = w.tag_id WHERE w.status = 'active' ORDER BY w.updated_at DESC, w.id DESC LIMIT ?",
			[limit],
		);
	}

	async createArtist(name: string, normalizedName: string, userId: number): Promise<void> {
		await execute(this.db, 'INSERT INTO artists (id, name, normalized_name, updated_by, created_at, updated_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM artists), 1), ?, ?, ?, ?, ?)', [
			name,
			normalizedName,
			userId,
			Date.now(),
			Date.now(),
		]);
	}

	async setArtistStatus(id: number, status: 'active' | 'deleted', userId: number): Promise<void> {
		await execute(this.db, 'UPDATE artists SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?', [status, userId, Date.now(), id]);
	}

	async addArtistAlias(artistId: number, alias: string): Promise<void> {
		await execute(this.db, 'INSERT INTO artist_aliases (artist_id, alias, normalized_alias, created_at) VALUES (?, ?, ?, ?)', [artistId, alias, alias.trim().toLowerCase(), Date.now()]);
	}

	listPostArtists(postId: number): Promise<{ artist_id: number; name: string }[]> {
		return queryAll(this.db, 'SELECT pa.artist_id, a.name FROM post_artists pa JOIN artists a ON a.id = pa.artist_id WHERE pa.post_id = ? ORDER BY a.normalized_name', [postId]);
	}

	addPostArtist(postId: number, artistId: number, userId: number): Promise<void> {
		return execute(this.db, 'INSERT OR IGNORE INTO post_artists (post_id, artist_id, added_by, created_at) VALUES (?, ?, ?, ?)', [postId, artistId, userId, Date.now()]).then(() => undefined);
	}

	removePostArtist(postId: number, artistId: number): Promise<void> {
		return execute(this.db, 'DELETE FROM post_artists WHERE post_id = ? AND artist_id = ?', [postId, artistId]).then(() => undefined);
	}

	async createPool(publicId: string, name: string, description: string | null, userId: number): Promise<void> {
		await execute(this.db, 'INSERT INTO pools (id, public_id, name, description, creator_id, created_at, updated_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM pools), 1), ?, ?, ?, ?, ?, ?)', [
			publicId,
			name,
			description,
			userId,
			Date.now(),
			Date.now(),
		]);
	}

	async createTopic(categoryId: number, title: string, userId: number, body: string): Promise<void> {
		const now = Date.now();
		const topicId = (await queryOne<{ v: number }>(this.db, 'SELECT COALESCE(MAX(id), 0) + 1 AS v FROM forum_topics', []))?.v ?? 1;
		const postId = (await queryOne<{ v: number }>(this.db, 'SELECT COALESCE(MAX(id), 0) + 1 AS v FROM forum_posts', []))?.v ?? 1;
		await this.db.batch([
			this.db.prepare('INSERT INTO forum_topics (id, category_id, author_id, title, last_post_at, last_author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(topicId, categoryId, userId, title, now, userId, now, now),
			this.db.prepare('INSERT INTO forum_posts (id, topic_id, author_id, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(postId, topicId, userId, body, now, now),
		]);
	}

	async createWiki(tagId: number, title: string, body: string, userId: number): Promise<void> {
		const now = Date.now();
		const pageId = (await queryOne<{ v: number }>(this.db, 'SELECT COALESCE(MAX(id), 0) + 1 AS v FROM wiki_pages', []))?.v ?? 1;
		const revisionId = (await queryOne<{ v: number }>(this.db, 'SELECT COALESCE(MAX(id), 0) + 1 AS v FROM wiki_revisions', []))?.v ?? 1;
		await this.db.batch([
			this.db.prepare('INSERT INTO wiki_pages (id, tag_id, title, current_revision_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(pageId, tagId, title, revisionId, userId, now, now),
			this.db.prepare('INSERT INTO wiki_revisions (id, wiki_page_id, body, editor_id, created_at) VALUES (?, ?, ?, ?, ?)').bind(revisionId, pageId, body, userId, now),
		]);
	}

	async addForumReply(topicId: number, body: string, userId: number): Promise<void> {
		const now = Date.now();
		await this.db.batch([
			this.db.prepare('INSERT INTO forum_posts (id, topic_id, author_id, body, created_at, updated_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM forum_posts), 1), ?, ?, ?, ?, ?)').bind(topicId, userId, body, now, now),
			this.db.prepare('UPDATE forum_topics SET reply_count = reply_count + 1, last_post_at = ?, last_author_id = ?, updated_at = ? WHERE id = ?').bind(now, userId, now, topicId),
		]);
	}

	async addPoolPost(poolId: number, postId: number, userId: number): Promise<void> {
		const position = (await queryOne<{ v: number }>(this.db, 'SELECT COALESCE(MAX(position), 0) + 1 AS v FROM pool_posts WHERE pool_id = ?', [poolId]))?.v ?? 1;
		await execute(this.db, 'INSERT INTO pool_posts (pool_id, post_id, position, added_by, created_at) VALUES (?, ?, ?, ?, ?)', [poolId, postId, position, userId, Date.now()]);
	}

	async removePoolPost(poolId: number, postId: number): Promise<void> {
		await execute(this.db, 'DELETE FROM pool_posts WHERE pool_id = ? AND post_id = ?', [poolId, postId]);
	}

	async reorderPoolPost(poolId: number, postId: number, position: number): Promise<void> {
		const current = await queryOne<{ position: number }>(this.db, 'SELECT position FROM pool_posts WHERE pool_id = ? AND post_id = ?', [poolId, postId]);
		if (!current || current.position === position) return;
		const shift = current.position < position ? 'position = position - 1' : 'position = position + 1';
		const low = Math.min(current.position, position);
		const high = Math.max(current.position, position);
		await this.db.batch([
			this.db.prepare('UPDATE pool_posts SET position = -position - 1 WHERE pool_id = ? AND post_id = ?').bind(poolId, postId),
			this.db.prepare('UPDATE pool_posts SET ' + shift + ' WHERE pool_id = ? AND position >= ? AND position <= ?').bind(poolId, low, high),
			this.db.prepare('UPDATE pool_posts SET position = ? WHERE pool_id = ? AND post_id = ?').bind(position, poolId, postId),
		]);
	}

	async updateTopic(topicId: number, title: string, userId: number): Promise<void> {
		await this.db.batch([
			this.db.prepare('UPDATE forum_topics SET title = ?, updated_at = ? WHERE id = ?').bind(title, Date.now(), topicId),
			this.db
				.prepare('INSERT INTO entity_revisions (id, entity_type, entity_id, editor_id, action, field_name, old_value, new_value, created_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM entity_revisions), 1), ?, ?, ?, ?, ?, ?, ?, ?)')
				.bind('forum_topic', topicId, userId, 'update', 'title', null, title, Date.now()),
		]);
	}

	async setTopicStatus(topicId: number, status: 'open' | 'locked' | 'hidden', pinned: boolean): Promise<void> {
		await execute(this.db, 'UPDATE forum_topics SET status = ?, is_pinned = ?, updated_at = ? WHERE id = ?', [status, pinned ? 1 : 0, Date.now(), topicId]);
	}

	getWiki(id: number): Promise<WikiPageRow | null> {
		return queryOne<WikiPageRow>(this.db, "SELECT id, tag_id, title, current_revision_id, status, created_by, created_at, updated_at FROM wiki_pages WHERE id = ? AND status = 'active'", [id]);
	}

	listWikiRevisions(pageId: number): Promise<WikiRevisionRow[]> {
		return queryAll<WikiRevisionRow>(this.db, 'SELECT id, wiki_page_id, body, editor_id, created_at, reason FROM wiki_revisions WHERE wiki_page_id = ? ORDER BY id DESC', [pageId]);
	}

	getWikiRevision(id: number): Promise<WikiRevisionRow | null> {
		return queryOne<WikiRevisionRow>(this.db, 'SELECT id, wiki_page_id, body, editor_id, created_at, reason FROM wiki_revisions WHERE id = ?', [id]);
	}

	async reviseWiki(pageId: number, body: string, reason: string | null, userId: number): Promise<void> {
		const now = Date.now();
		const revisionId = (await queryOne<{ v: number }>(this.db, 'SELECT COALESCE(MAX(id), 0) + 1 AS v FROM wiki_revisions', []))?.v ?? 1;
		await this.db.batch([
			this.db.prepare('INSERT INTO wiki_revisions (id, wiki_page_id, body, editor_id, created_at, reason) VALUES (?, ?, ?, ?, ?, ?)').bind(revisionId, pageId, body, userId, now, reason),
			this.db.prepare('UPDATE wiki_pages SET current_revision_id = ?, updated_at = ? WHERE id = ?').bind(revisionId, now, pageId),
			this.db
				.prepare('INSERT INTO entity_revisions (id, entity_type, entity_id, editor_id, action, field_name, old_value, new_value, created_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM entity_revisions), 1), ?, ?, ?, ?, ?, ?, ?, ?)')
				.bind('wiki_page', pageId, userId, 'update', 'body', null, body, now),
		]);
	}

	listPoolPosts(poolId: number): Promise<Pick<PoolRow, 'id'>[]> {
		return queryAll<Pick<PoolRow, 'id'>>(this.db, 'SELECT post_id AS id FROM pool_posts WHERE pool_id = ? ORDER BY position, post_id', [poolId]);
	}

	listForumPosts(topicId: number): Promise<ForumPostRow[]> {
		return queryAll<ForumPostRow>(this.db, 'SELECT id, topic_id, author_id, body, created_at, updated_at, edited_at FROM forum_posts WHERE topic_id = ? ORDER BY id', [topicId]);
	}

	getTopic(id: number): Promise<ForumTopicRow | null> {
		return queryOne<ForumTopicRow>(this.db, 'SELECT id, category_id, author_id, title, status, is_pinned, reply_count, last_post_at, last_author_id, created_at, updated_at FROM forum_topics WHERE id = ?', [id]);
	}

	async editForumPost(id: number, body: string, userId: number): Promise<void> {
		await execute(this.db, 'UPDATE forum_posts SET body = ?, updated_at = ?, edited_at = ? WHERE id = ? AND author_id = ?', [body, Date.now(), Date.now(), id, userId]);
	}

	async createContact(email: string, subject: string, body: string, requesterId: number | null): Promise<void> {
		await execute(this.db, 'INSERT INTO contact_tickets (id, requester_id, email, subject, body, created_at, updated_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM contact_tickets), 1), ?, ?, ?, ?, ?, ?)', [
			requesterId,
			email,
			subject,
			body,
			Date.now(),
			Date.now(),
		]);
	}

	listContacts(limit: number): Promise<ContactTicketRow[]> {
		return queryAll<ContactTicketRow>(this.db, 'SELECT id, requester_id, email, subject, body, status, created_at, updated_at FROM contact_tickets ORDER BY updated_at DESC, id DESC LIMIT ?', [limit]);
	}

	async createMail(subject: string, body: string, senderId: number, recipientId: number): Promise<void> {
		const now = Date.now();
		const threadId = (await queryOne<{ v: number }>(this.db, 'SELECT COALESCE(MAX(id), 0) + 1 AS v FROM mail_threads', []))?.v ?? 1;
		const messageId = (await queryOne<{ v: number }>(this.db, 'SELECT COALESCE(MAX(id), 0) + 1 AS v FROM mail_messages', []))?.v ?? 1;
		await this.db.batch([
			this.db.prepare('INSERT INTO mail_threads (id, subject, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').bind(threadId, subject, senderId, now, now),
			this.db.prepare('INSERT INTO mail_thread_users (thread_id, user_id, last_read_at) VALUES (?, ?, ?)').bind(threadId, senderId, now),
			this.db.prepare('INSERT INTO mail_thread_users (thread_id, user_id) VALUES (?, ?)').bind(threadId, recipientId),
			this.db.prepare('INSERT INTO mail_messages (id, thread_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(messageId, threadId, senderId, body, now),
		]);
	}

	listMail(userId: number, limit: number): Promise<MailMessageRow[]> {
		return queryAll<MailMessageRow>(
			this.db,
			'SELECT m.id, m.thread_id, m.sender_id, m.body, m.created_at FROM mail_messages m JOIN mail_thread_users u ON u.thread_id = m.thread_id WHERE u.user_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?',
			[userId, limit],
		);
	}
}
