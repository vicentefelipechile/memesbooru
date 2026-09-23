// =========================================================================================================
// COMMUNITY SERVICE
// =========================================================================================================

import type { DB } from '../db/client';
import { CommunityRepository } from '../repositories/community-repository';
import { normalizeTag } from '../validators';
import type { AuthUser } from '../types';
import { ForbiddenError } from '../domain/errors';

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

	createArtist(user: AuthUser, name: string): Promise<void> {
		return this.community.createArtist(name, normalizeTag(name), user.id);
	}

	setArtistStatus(id: number, status: 'active' | 'deleted', user: AuthUser): Promise<void> {
		return this.community.setArtistStatus(id, status, user.id);
	}

	addArtistAlias(artistId: number, alias: string): Promise<void> {
		return this.community.addArtistAlias(artistId, alias);
	}

	listPostArtists(postId: number) {
		return this.community.listPostArtists(postId);
	}

	addPostArtist(user: AuthUser, postId: number, artistId: number): Promise<void> {
		if (!user.isAdmin && user.rank !== 'trusted') throw new ForbiddenError('se requiere rango trusted');
		return this.community.addPostArtist(postId, artistId, user.id);
	}

	removePostArtist(user: AuthUser, postId: number, artistId: number): Promise<void> {
		if (!user.isAdmin && user.rank !== 'trusted') throw new ForbiddenError('se requiere rango trusted');
		return this.community.removePostArtist(postId, artistId);
	}

	createPool(user: AuthUser, name: string, description: string | null): Promise<void> {
		return this.community.createPool(crypto.randomUUID().replaceAll('-', '').slice(0, 12), name, description, user.id);
	}

	createTopic(user: AuthUser, categoryId: number, title: string, body: string): Promise<void> {
		return this.community.createTopic(categoryId, title, user.id, body);
	}

	createWiki(user: AuthUser, tagId: number, title: string, body: string): Promise<void> {
		return this.community.createWiki(tagId, title, body, user.id);
	}

	addReply(user: AuthUser, topicId: number, body: string): Promise<void> {
		return this.replyToTopic(user, topicId, body);
	}

	private async replyToTopic(user: AuthUser, topicId: number, body: string): Promise<void> {
		const topic = await this.community.getTopic(topicId);
		if (!topic || topic.status !== 'open') throw new ForbiddenError('topic locked');
		await this.community.addForumReply(topicId, body, user.id);
	}

	addPoolPost(user: AuthUser, poolId: number, postId: number): Promise<void> {
		return this.changePool(user, poolId, () => this.community.addPoolPost(poolId, postId, user.id));
	}

	async removePoolPost(poolId: number, postId: number, user?: AuthUser): Promise<void> {
		if (user) await this.assertPoolOwner(user, poolId);
		await this.community.removePoolPost(poolId, postId);
	}

	async reorderPoolPost(poolId: number, postId: number, position: number, user?: AuthUser): Promise<void> {
		if (user) await this.assertPoolOwner(user, poolId);
		await this.community.reorderPoolPost(poolId, postId, position);
	}

	private async assertPoolOwner(user: AuthUser, poolId: number): Promise<void> {
		const pool = await this.community.getPool(poolId);
		if (!pool || (pool.creator_id !== user.id && !user.isAdmin)) throw new ForbiddenError('pool permission denied');
	}

	private async changePool(user: AuthUser, poolId: number, action: () => Promise<void>): Promise<void> {
		await this.assertPoolOwner(user, poolId);
		await action();
	}

	updateTopic(user: AuthUser, topicId: number, title: string): Promise<void> {
		return this.community.updateTopic(topicId, title, user.id);
	}

	setTopicStatus(user: AuthUser, topicId: number, status: 'open' | 'locked' | 'hidden', pinned: boolean): Promise<void> {
		if (!user.isAdmin && user.rank !== 'trusted') throw new ForbiddenError('se requiere rango trusted');
		return this.community.setTopicStatus(topicId, status, pinned);
	}

	getWiki(id: number) {
		return this.community.getWiki(id);
	}

	listWikiRevisions(id: number) {
		return this.community.listWikiRevisions(id);
	}

	reviseWiki(user: AuthUser, id: number, body: string, reason: string | null): Promise<void> {
		return this.community.reviseWiki(id, body, reason, user.id);
	}

	async revertWiki(user: AuthUser, pageId: number, revisionId: number): Promise<void> {
		const revision = await this.community.getWikiRevision(revisionId);
		if (!revision || revision.wiki_page_id !== pageId) throw new ForbiddenError('revision not found');
		await this.community.reviseWiki(pageId, revision.body, 'revert', user.id);
	}

	listPoolPosts(id: number) {
		return this.community.listPoolPosts(id);
	}

	listForumPosts(id: number) {
		return this.community.listForumPosts(id);
	}

	getTopic(id: number) {
		return this.community.getTopic(id);
	}

	editForumPost(user: AuthUser, id: number, body: string): Promise<void> {
		return this.community.editForumPost(id, body, user.id);
	}

	createContact(email: string, subject: string, body: string, requesterId: number | null): Promise<void> {
		return this.community.createContact(email, subject, body, requesterId);
	}

	listContacts(limit: number) {
		return this.community.listContacts(limit);
	}

	createMail(user: AuthUser, subject: string, body: string, recipientId: number): Promise<void> {
		return this.community.createMail(subject, body, user.id, recipientId);
	}

	listMail(user: AuthUser, limit: number) {
		return this.community.listMail(user.id, limit);
	}
}
