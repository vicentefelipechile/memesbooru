// =========================================================================================================
// DB SCHEMA — ROW TYPES (v2)
// =========================================================================================================
// Mirror exact DB columns in snake_case. One interface per table. Shared SQL fragments here.
// =========================================================================================================

export interface UserRow {
	id: number;
	username: string;
	display_name: string | null;
	rank: string;
	status: string;
	trust_score: number;
	created_at: number;
	last_login_at: number | null;
	last_activity_at: number | null;
}

export interface GoogleIdentityRow {
	user_id: number;
	google_subject: string;
	created_at: number;
	last_login_at: number | null;
}

export interface SessionRow {
	id: number;
	user_id: number;
	token_hash: ArrayBuffer;
	created_at: number;
	expires_at: number;
	last_seen_at: number;
	revoked_at: number | null;
}

export interface PostRow {
	id: number;
	public_id: string;
	author_id: number;
	canonical_post_id: number | null;
	media_type: string;
	status: string;
	title: string | null;
	description: string | null;
	score: number;
	rating_count: number;
	favorite_count: number;
	comment_count: number;
	created_at: number;
	published_at: number | null;
	updated_at: number;
}

export interface PostListingRow {
	post_id: number;
	public_id: string;
	media_type: string;
	status: string;
	low_variant_key: string;
	medium_variant_key: string | null;
	width: number | null;
	height: number | null;
	score: number;
	rating_count: number;
	favorite_count: number;
	comment_count: number;
	published_at: number;
}

export interface MediaAssetRow {
	id: number;
	post_id: number;
	media_type: string;
	provider: string;
	original_object_key: string;
	mime_type: string;
	byte_size: number;
	width: number | null;
	height: number | null;
	duration_ms: number | null;
	checksum: ArrayBuffer;
	processing_status: string;
	created_at: number;
}

export interface MediaVariantRow {
	id: number;
	media_asset_id: number;
	variant_name: string;
	object_key: string;
	mime_type: string;
	byte_size: number;
	width: number | null;
	height: number | null;
	quality_class: string;
	visibility: string;
	created_at: number;
}

export interface TagRow {
	id: number;
	normalized_name: string;
	display_name: string | null;
	category: string;
	usage_count: number;
	status: string;
	created_by: number | null;
	created_at: number;
	updated_at: number;
}

export interface TagAliasRow {
	id: number;
	alias_normalized: string;
	tag_id: number;
	created_by: number;
	created_at: number;
}

export interface PostTagRow {
	post_id: number;
	tag_id: number;
	added_by: number;
	created_at: number;
}

export interface PostRatingRow {
	post_id: number;
	user_id: number;
	value: number;
	created_at: number;
	updated_at: number;
}

export interface PostFavoriteRow {
	post_id: number;
	user_id: number;
	created_at: number;
}

export interface CommentRow {
	id: number;
	post_id: number;
	author_id: number;
	parent_id: number | null;
	body: string;
	status: string;
	created_at: number;
	updated_at: number;
	deleted_at: number | null;
}

export interface UserActivityRow {
	user_id: number;
	approved_posts: number;
	rejected_posts: number;
	comments_count: number;
	confirmed_reports: number;
	last_upload_at: number | null;
	last_comment_at: number | null;
	updated_at: number;
}

export interface ReportRow {
	id: number;
	reporter_id: number;
	target_type: string;
	target_id: number;
	reason: string;
	status: string;
	created_at: number;
	resolved_at: number | null;
}

export interface JobRow {
	id: number;
	job_type: string;
	entity_id: number;
	status: string;
	attempts: number;
	available_at: number;
	locked_at: number | null;
	completed_at: number | null;
	created_at: number;
}

// Shared predicates

export const VISIBLE_COMMENT_PREDICATE = "status = 'visible'" as const;
export const AVAILABLE_POST_PREDICATE = "status = 'available'" as const;
