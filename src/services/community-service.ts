// =========================================================================================================
// COMMUNITY SERVICE
// =========================================================================================================

import type { DB } from '../db/client';
import { CommunityRepository } from '../repositories/community-repository';
import { PostRepository } from '../repositories/post-repository';
import { TagService } from './tag-service';
import { normalizeTag } from '../validators';
import type { AuthUser } from '../types';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
import { PermissionService } from './permission-service';

export class CommunityService {
	private readonly community: CommunityRepository;

	constructor(private readonly db: DB) {
		this.community = new CommunityRepository(db);
	}

	listArtists(limit = 50) {
		return this.community.listArtists(limit);
	}
	listPools(limit = 50) {
		return this.community.listPools(limit);
	}
	listTopics(limit = 50) {
		return this.community.listTopics(limit);
	}
	listCategories() {
		return this.community.listCategories();
	}
	listWiki(limit = 50) {
		return this.community.listWiki(limit);
	}

	async createArtist(user: AuthUser, name: string): Promise<void> {
		new PermissionService(this.db).require(user, 'manage_artists');
		const normalized = normalizeTag(name);
		if (!normalized) throw new ValidationError('Invalid artist name');
		if (await this.community.findArtistName(normalized)) throw new ConflictError('Artist name already exists');

		await this.community.createArtist(name, normalized, user.id);
	}

	async setArtistStatus(id: number, status: 'active' | 'deleted', user: AuthUser): Promise<void> {
		new PermissionService(this.db).require(user, 'manage_artists');
		if (!(await this.community.getArtist(id))) throw new NotFoundError('Artist not found');

		await this.community.setArtistStatus(id, status, user.id);
	}

	async addArtistAlias(user: AuthUser, artistId: number, alias: string): Promise<void> {
		new PermissionService(this.db).require(user, 'manage_artists');
		const artist = await this.community.getArtist(artistId);
		if (!artist || artist.status !== 'active') throw new NotFoundError('Artist not found');
		const normalized = normalizeTag(alias);
		if (!normalized) throw new ValidationError('Invalid artist alias');
		if (await this.community.findArtistName(normalized)) throw new ConflictError('Artist alias already exists');

		await this.community.addArtistAlias(artistId, alias, normalized);
	}

	async listPostArtists(postId: number) {
		await this.assertPostExists(postId);

		return this.community.listPostArtists(postId);
	}

	async addPostArtist(user: AuthUser, postId: number, artistId: number): Promise<void> {
		new PermissionService(this.db).require(user, 'manage_artists');
		await this.assertPostExists(postId);
		if (!(await this.community.getArtist(artistId))) throw new NotFoundError('Artist not found');

		await this.community.addPostArtist(postId, artistId, user.id);
	}

	async removePostArtist(user: AuthUser, postId: number, artistId: number): Promise<void> {
		new PermissionService(this.db).require(user, 'manage_artists');
		await this.assertPostExists(postId);
		if (!(await this.community.getArtist(artistId))) throw new NotFoundError('Artist not found');

		await this.community.removePostArtist(postId, artistId);
	}

	createPool(user: AuthUser, name: string, description: string | null): Promise<void> {
		new PermissionService(this.db).require(user, 'create_pool');
		return this.community.createPool(crypto.randomUUID().replaceAll('-', '').slice(0, 12), name, description, user.id);
	}

	async createTopic(user: AuthUser, categoryId: number, title: string, body: string): Promise<void> {
		new PermissionService(this.db).require(user, 'create_topic');
		if (!(await this.community.findCategory(categoryId))) throw new NotFoundError('Forum category not found');

		await this.community.createTopic(categoryId, title, user.id, body);
	}

	async createWiki(user: AuthUser, tagName: string, title: string, body: string): Promise<void> {
		new PermissionService(this.db).require(user, 'edit_wiki');
		const tagId = await new TagService(this.db).resolveId(tagName);
		if (await this.community.findWikiByTagId(tagId)) throw new ConflictError('Wiki page already exists');

		await this.community.createWiki(tagId, title, body, user.id);
	}

	addReply(user: AuthUser, topicId: number, body: string): Promise<void> {
		return this.replyToTopic(user, topicId, body);
	}

	private async replyToTopic(user: AuthUser, topicId: number, body: string): Promise<void> {
		const topic = await this.getTopic(topicId);
		if (topic.status !== 'open') throw new ForbiddenError('topic locked');

		await this.community.addForumReply(topicId, body, user.id);
	}

	async addPoolPost(user: AuthUser, poolId: number, postId: number): Promise<void> {
		await this.assertPoolOwner(user, poolId);
		await this.assertPostExists(postId);
		if (await this.community.getPoolPost(poolId, postId)) throw new ConflictError('Post already in pool');

		await this.community.addPoolPost(poolId, postId, user.id);
	}

	async removePoolPost(poolId: number, postId: number, user?: AuthUser): Promise<void> {
		if (user) await this.assertPoolOwner(user, poolId);
		if (!(await this.community.getPoolPost(poolId, postId))) throw new NotFoundError('Pool post not found');

		await this.community.removePoolPost(poolId, postId);
	}

	async reorderPoolPost(poolId: number, postId: number, position: number, user?: AuthUser): Promise<void> {
		if (user) await this.assertPoolOwner(user, poolId);
		if (!(await this.community.getPoolPost(poolId, postId))) throw new NotFoundError('Pool post not found');

		await this.community.reorderPoolPost(poolId, postId, position);
	}

	private async assertPoolOwner(user: AuthUser, poolId: number): Promise<void> {
		const pool = await this.community.getPool(poolId);
		if (!pool) throw new NotFoundError('Pool not found');
		if (pool.creator_id !== user.id && !new PermissionService(this.db).has(user, 'manage_roles')) throw new ForbiddenError('pool permission denied');
	}

	private async assertPostExists(postId: number): Promise<void> {
		if (!(await new PostRepository(this.db).findPostIdById(postId))) throw new NotFoundError('Post not found');
	}

	async updateTopic(user: AuthUser, topicId: number, title: string): Promise<void> {
		const topic = await this.getTopic(topicId);
		if (topic.author_id !== user.id) throw new ForbiddenError('Topic permission denied');

		await this.community.updateTopic(topicId, title, user.id);
	}

	async setTopicStatus(user: AuthUser, topicId: number, status: 'open' | 'locked' | 'hidden', pinned: boolean): Promise<void> {
		new PermissionService(this.db).require(user, 'manage_forum');
		await this.getTopic(topicId);

		await this.community.setTopicStatus(topicId, status, pinned);
	}

	async getWiki(id: number) {
		const page = await this.community.getWiki(id);
		if (!page) throw new NotFoundError('Wiki page not found');

		return page;
	}

	async listWikiRevisions(id: number) {
		await this.getWiki(id);

		return this.community.listWikiRevisions(id);
	}

	async reviseWiki(user: AuthUser, id: number, body: string, reason: string | null): Promise<void> {
		new PermissionService(this.db).require(user, 'edit_wiki');
		await this.getWiki(id);

		await this.community.reviseWiki(id, body, reason, user.id);
	}

	async revertWiki(user: AuthUser, pageId: number, revisionId: number): Promise<void> {
		new PermissionService(this.db).require(user, 'edit_wiki');
		await this.getWiki(pageId);
		const revision = await this.community.getWikiRevision(revisionId);
		if (!revision || revision.wiki_page_id !== pageId) throw new NotFoundError('Revision not found');

		await this.community.reviseWiki(pageId, revision.body, 'revert', user.id);
	}

	async listPoolPosts(id: number) {
		if (!(await this.community.getPool(id))) throw new NotFoundError('Pool not found');

		return this.community.listPoolPosts(id);
	}

	async listForumPosts(id: number) {
		await this.getTopic(id);

		return this.community.listForumPosts(id);
	}

	async getTopic(id: number) {
		const topic = await this.community.getTopic(id);
		if (!topic) throw new NotFoundError('Topic not found');

		return topic;
	}

	async editForumPost(user: AuthUser, id: number, body: string): Promise<void> {
		const post = await this.community.getForumPost(id);
		if (!post) throw new NotFoundError('Forum post not found');
		if (post.author_id !== user.id) throw new ForbiddenError('Post permission denied');

		await this.community.editForumPost(id, body, user.id);
	}

	createContact(user: AuthUser, subject: string, body: string): Promise<void> {
		new PermissionService(this.db).require(user, 'contact');
		return this.community.createContact(subject, body, user.id);
	}

	listContacts(limit: number) {
		return this.community.listContacts(limit);
	}
}
