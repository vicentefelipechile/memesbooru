# AGENTS.md — Memesbooru

> Source of truth is the **current codebase** (`src/`). `PLAN.md` is reference only. If they conflict, trust the code + this file.

## 1. Project Overview

Memesbooru is a booru-style meme catalog (Spanish-first) optimized for read speed at scale: 100k users / 37k tags / 1.5M posts / ~15M `post_tags`. Reference UX is Rule34's search/catalog, not its content/branding.

**Stack:** TypeScript 5.8 `strict` • Hono 4 • Cloudflare Workers (single Worker) • D1 (single primary DB + `post_listing` read projection) • R2 (`MEDIA_BUCKET` + `QUARANTINE_BUCKET`) • Queues (`MEDIA_QUEUE` + DLQ) • Images/Stream for variants • Vite 6 • Vitest 3 + `@cloudflare/vitest-pool-workers`.

**Principle:** read-speed over dev-ease. No `SELECT *` on public endpoints, no JSON columns for filterable data, cursor pagination, materialized counters.

## 2. Architecture — Repository-Service over Hono

```
Hono (src/index.ts / src/http/routes/*)
  -> Controller (thin Hono handler: auth + Zod safeParse + service call + response)
    -> Service (src/services/*: business rules, permissions, ranking, Queue jobs; throws DomainError)
      -> Repository (src/repositories/*: ONLY place with SQL / D1 / R2)
        -> Cloudflare Binding (D1Database / R2Bucket / Queue) via src/db/client.ts
```

**Rules (enforced in review):**
- Routes: zero business logic, zero SQL. `zValidator` or `parseJsonBody` + `Schema.safeParse` before service. `throw` DomainError, let `app.onError` (`src/index.ts:36`) handle it.
- Services: no Hono, no `c.env.DB` direct. Constructor `new Service(db: DB)`. Use `src/types.ts` branded ids and `src/validators.ts` inferred types.
- Repositories: only SQL via `queryOne<T> / queryAll<T> / execute / batch` from `src/db/client.ts`. Never import `c.env.DB` outside `index.ts` / routes.
- Domain (`src/domain/errors.ts`): pure, no Cloudflare types. Services throw `NotFoundError / ValidationError / ForbiddenError` etc.
- `src/index.ts` is composition root only: middleware, route mounting, `onError`, `notFound`, `fetch/queue/scheduled` exports.

## 3. Directory Structure (actual)

```
src/
  client/        # vanilla TS frontend (no framework): app/router, pages/*, components/*, services/api.ts, state/store, styles/ (modular, one file per category)
  db/            # schema.ts (Row interfaces snake_case) + client.ts (typed D1 client)
  domain/        # errors.ts (DomainError hierarchy)
  helpers/       # cursor.ts, query-builder.ts, file-validation.ts, net.ts, http.ts, crypto.ts (pure, reusable)
  http/          # routes/* (posts, comments, tags, auth, moderation, interactions, health) + middleware/auth,security + responses.ts, rate-limits.ts
  queues/        # processor.ts (typed QueueMessage, idempotent)
  repositories/  # post, tag, comment, media, user, session, auth, moderation, activity
  services/      # post, comment, interaction, moderation, ranking, auth
  validators.ts  # single Zod validator monolith
  types.ts       # single type monolith (DTOs + branded ids + helpers)
  index.ts       # Hono app
migrations/      # D1 versioned SQL
tests/           # server/* (vitest + miniflare)
```

Planned `server/` / `shared/` layout in `PLAN.md:248` does not exist — do not create it.

## 4. Single Sources of Truth

### 4.1 `src/db/schema.ts` — Row types
One `interface` per table, exact snake_case DB columns. Shared predicates `VISIBLE_COMMENT_PREDICATE` / `AVAILABLE_POST_PREDICATE`. No DTOs here.
Central query projections (never inline `{ v: number }` / `{ c: number }`): `NextIdRow { v: number }` (7× `MAX(id)+1`), `CountRow { c: number }` (COUNT), `PostDetailRow = PostListingRow & Pick<PostRow,'author_id'|'title'|'description'|'canonical_post_id'>` (for `findByPublicId`). Unique projections use `Pick<Row,'col'>` directly (`Pick<TagAliasRow,'tag_id'|'alias_normalized'>`, `Pick<UserTotpRow,'secret_encrypted'>`). `UserTotpRow` mirrors `user_totp` (`migrations/0001`). No branded ids here — canonical `Brand<T,B>` lives only in `src/types.ts`.

### 4.2 `src/types.ts` — API contracts & type helpers
**Do NOT duplicate types elsewhere.** Frontend has its own copy (`src/client` never imports `src/types`).

Contains:
- Enums as `as const satisfies` unions: `UserRank`, `UserStatus`, `PostStatus`, `MediaType`
- DTOs: `UserDTO`, `PostDTO` (`DeepReadonly<CamelCased<Omit<PostRow>>>`), `TagDTO`, `CommentDTO` (`CommentId`/`PostId` branded)
- `AuthUser { id: UserId }`, `PaginatedResponse<T>`
- Branded ids: `Brand<T,B>`, `UserId/PostId/PublicId/TagId/CommentId` + constructors `toUserId(n)` etc. (`src/types.ts:89`). Use at boundaries, never mix raw `number`.
- Helpers: `SqlParam` (canonical in `src/db/client.ts`, re-exported from `src/types.ts`), `JsonValue/JsonPrimitive`, `ErrorDetails`, `QueueMessage` (discriminated union), `CamelCased<T>` (`SnakeToCamel`), `DeepReadonly<T>`, `NoInfer<T>`, `VariadicFn`, `AwaitedReturn`, `PostSearchResult`, `PostDetailResult`
- `PostDetailResult` = `PostListingRow` + `author_id/author_username/title/description/canonical_post_id/tags` (tags are `PostTagResult[]` = `{name,category,count}`, enriched for the booru sidebar)
- `CommentResult` = `CommentRow` + `author_username` (joined in `comment-repository.listByPost`)
- Derived: `EntityId = Pick<ReportRow,'id'>`, `CreatedPostResult = { publicId: PublicId; postId: PostId }`
- Service results (never inline `Promise<{...}>`): `SearchResult { data: PostSearchResult[]; nextCursor; hasMore }`, `TagItem { name; display; usage }`, `TagItemsResult { tags: TagItem[] }`, `BrowseParams { perCategoryLimit? }`, `BrowseCategoryParams { limit?; offset? }`, `SessionTokenPair { token; hash }`, `GoogleTokens { id_token; access_token }`, `AuthUserBrief { id; username; rank }`, `SessionVerification { userId }`
- Re-exports: `ReportInput`, `CreatePostInput` etc. from `validators.ts` — never inline anonymous `{id:number}`

### 4.3 `src/validators.ts` — Zod is the only validator
Every route `safeParse` before service. Helpers: `sanitizeHtml`, `normalizeTag`, `parseQueryWithArrays`. Enums `USER_RANKS/POST_STATUSES/MEDIA_TYPES/TAG_CATEGORIES as const satisfies readonly string[]`. Schemas `CreatePostSchema/CommentSchema/RatingSchema/ReportSchema/...` + inferred `z.infer` types (`SearchQueryInput`, `PaginationInput` etc.). Response schemas `HealthResponseSchema/SearchResponseSchema/PostResponseSchema/...` for frontend `safeParse` without `as`. Detail/tag/comment schemas expose the booru sidebar fields: `PostTagSchema {name,category,count}`, `PostResponseSchema.author_username`, `CommentItemSchema.author_username/created_at`, `FavoritesResponseSchema`, `TotpSetupResponseSchema/TotpVerifyResponseSchema`.

## 5. Why `unknown` is FORBIDDEN

**Philosophy: if you need `unknown`, you missed a type.**

Backend scope is `src/db|domain|helpers|http|queues|repositories|services` (+ `index.ts`). `src/types.ts` / `src/validators.ts` are exempt monoliths (generic utilities like `DeepReadonly`/`NoInfer`/`VariadicFn` may use `unknown` there). `src/client` / `src/tools` are out of scope.

- `unknown[]` hides `D1` bind types → use `SqlParam` (canonical in `src/db/client.ts:8`, re-exported from `src/types.ts`). `0× unknown` type / `0× any` in backend is enforced (`tsc` + `Select-String`).
- `Promise<unknown>` / `Record<string,unknown>` hides domain → use `PostSearchResult[]`, `PostDetailResult`, `JsonValue`, `ErrorDetails` (`ZodIssue[] | JsonValue`), `QueueMessage`. Example fix: `routes/tags.ts:64` used `Record<string,unknown>` → now `parseQueryWithArrays(c.req.url)` (`Record<string,string|string[]>`).
- `as unknown as X` hides branded mismatches → use `toUserId/toPostId/toPublicId` + `satisfies` (`src/services/post-service.ts:59`).
- Pre-Zod JSON body `unknown` → use `JsonValue` default `parseJsonBody<T extends JsonValue = JsonValue>` (`src/helpers/http.ts:9`) then `Schema.safeParse`. `parseJsonBody` returns named `ParseJsonResult<T>`, never inline union.
- `UPDATE`/`INSERT` without `RETURNING` → use `execute`, never `queryOne` without generic (untyped `queryOne` infers `unknown`). 8 sites migrated (`post/media/auth/activity` repos).
- DB `rank`/`status` strings → fail-closed guards `toUserRank/toUserStatus` (`src/http/middleware/auth.ts`), never bare `as UserRank`.

**Only `unknown` allowed in backend is the string literal `'unknown'` for IP fallback** (`src/helpers/net.ts:30`, `src/http/rate-limits.ts:20,29,37`).

Rules:
- Enable `strict` (`tsconfig.json:7`), never `any`. `any` only exists in `worker-configuration.d.ts` generated.
- Prefer `satisfies` over `as` (see §7), `DeepReadonly` for rows, `NoInfer` for generics, branded ids for `number`/`string` ids.

## 6. TypeScript Utilities & Advanced Types (used)

**Beyond `Pick/Omit/Partial`:**
- `Indexed Access` `PostRow['id']` for params (`src/repositories/post-repository.ts:189`)
- `keyof / typeof` `typeof USER_RANKS[number]` → `UserRank`
- `ReturnType / Parameters / Awaited` (`AwaitedReturn` in `types.ts`)
- `Exclude/Extract/NonNullable`, `Record`, `Required/Readonly`
- `Mapped Types + key remapping (as)` `CamelCased<T>` (`SnakeToCamel` with `Capitalize`)
- `Conditional + infer` `z.infer<typeof Schema>` (single source for service signatures)
- `Template Literals` `media/${string}/original` (`src/services/post-service.ts:85` satisfies)
- `satisfies` (TS 4.9) keeps literals while validating (`SORT_COLUMNS as const satisfies Record<string,string>` `src/repositories/post-repository.ts:28`, `MAX_FILE_SIZES as const satisfies Record<string,number>`)
- `as const` for const assertions, `DeepReadonly` for `PostDTO`, `readonly SqlParam[]` in `db/client.ts`
- `Discriminated Unions` `QueueMessage` (`src/types.ts:95`), `enum` Zod schemas
- `Assertion functions` `asserts id is PostId` (`src/repositories/post-repository.ts:203`), `assertValidMime`, `assertValidCursor` (`src/helpers/cursor.ts:24`)
- `Branded Types` `Brand<T,B>` (`src/types.ts:82`) — nominal typing without runtime cost
- `Variadic Tuples` `VariadicFn<Args,R>` for typed wrappers

**Conventions:**
- Derive service inputs via `Pick<SearchQueryInput,'tags'|'cursor'|'limit'> & {sort:...}` (`src/services/post-service.ts:25`), never inline.
- Derive cursor `PostCursor = {id: PostListingRow['post_id']} & Partial<Pick<PostListingRow,'score'|'published_at'>>` (`src/helpers/cursor.ts:11`).
- Derive statement inputs via indexed access: `InsertPostStatementData { id: PostRow['id']; publicId: PostRow['public_id']; ... }`, `InsertPostTagStatementData { postId: PostTagRow['post_id']; ... }` (`tag-repository.ts:215` was the `argMalHecho` example — never `row: { postId: number; ... }` inline). Same for `InsertMediaAssetStatementData`, `InsertCommentStatementData`, `InsertUserStatementData`, `InsertSessionStatementData`, `InsertVariantStatementData`.
- Name every signature shape: `SearchResult`, `TagItemsResult`, `ResolveAliasesResult`, `BuiltQuery { sql; params }`, `ParseJsonResult<T>`, `QueueEnv`, `HeaderReader/BareHeaderReader`, `SearchByTagsOpts`, `PostCountFilter`, `ListByCategoryOpts`, `ListUsersParams`.
- Use `satisfies` for literals, `toXId()` for branded conversions, `DeepReadonly` for DTOs.

## 7. Code Style & Quality

- **Files:** header comment `// ===` block, sections `// Imports`, `// Service`, `// Helpers`. Keep under ~200 lines; split if larger.
- **Imports:** absolute `src/*` via `paths: @/*`, but prefer relative. Group: external → internal → type.
- **Naming:** `camelCase` vars/fns, `PascalCase` types/classes, `snake_case` DB columns only in `schema.ts`, `UPPER_SNAKE` for `MAX_FILE_SIZES`/`ALLOWED_ORIGINS`.
- **Functions:** small, explicit return types on exports. Use `encodeCursor<T extends object>(obj:T)` generic (`src/helpers/cursor.ts:13`), `decodeCursor<T>(c:string):T|null`.
- **Vertical whitespace (anti-density):** one blank line between logical steps, one after every guard-clause/`early-return`, one before the final `return`. No more than ~8 consecutive non-blank lines inside a function body except SQL/`batch()` literals. Split into a same-file helper only when a function exceeds ~30 lines or 3 branches.
- **Error handling:** `DomainError` with `status` + `ErrorDetails` (`src/domain/errors.ts:9`). `fail(c,msg,status,details)` (`src/http/responses.ts:9`) for pre-service 400s. `app.onError` maps `DomainError`/`ZodError`.
- **Security:** `securityMiddleware` (`src/http/middleware/security.ts`), `isAllowedOrigin`/`isLocalRequest` (`src/helpers/net.ts`), `hashToken` (`src/helpers/crypto.ts`), `HttpOnly/Secure/SameSite` cookies.
- **Rate limiting:** native `RL_*` bindings (`wrangler.jsonc:40`), `registerRateLimits` (`src/http/rate-limits.ts`), skip for `isLocalRequest`.
- **No `any`/`unknown`/`as` abuse:** if you need `as`, you need `satisfies` or a branded helper or a `Zod` schema.

## 8. Hono & Validation Flow

```ts
// Route (src/http/routes/posts.ts)
const parsed = SearchQuerySchema.safeParse(parseQueryWithArrays(c.req.url))
if (!parsed.success) return fail(c,'Invalid query',400,parsed.error.issues) // ErrorDetails = ZodIssue[]
const service = new PostService(c.env.DB)
const data = await service.search({tags: parsed.data.tags, sort: parsed.data.sort, cursor: parsed.data.cursor, limit: parsed.data.limit})
return c.json(data)

// Service (src/services/post-service.ts) — no Hono, throws DomainError
async search(params: SearchParams): Promise<SearchResult> { ... }

// Repository (src/repositories/post-repository.ts) — only SQL
export async function searchByTags(db: DB, tagIds: TagId[], opts: SearchByTagsOpts): Promise<PostListingRow[]> { return queryAll<PostListingRow>(db, sql, params) }
```

- Use `zValidator('json', CreatePostSchema)` where Hono can, otherwise `parseJsonBody<T extends JsonValue>` + `safeParse`.
- Never `c.req.json() as SomeType` — always `safeParse`.

## 9. D1 / R2 / Queue / Cron

- `wrangler.jsonc` is canonical (not `wrangler.toml`). Run `npm run cf-typegen` after binding changes, type `Hono<{Bindings:Env}>`.
- D1: single primary `memesbooru-db`, `post_listing` projection, cursor `score DESC, post_id DESC` / `published_at DESC, post_id DESC` (`src/repositories/post-repository.ts:110`), no `OFFSET`, `batch()` for atomic writes, `EXPLAIN QUERY PLAN` before new indexes.
- R2: `media/{checksum}/low.avif` immutable keys (`src/queues/processor.ts:42`), `toBytes(checksum)` handles `ArrayBuffer|Uint8Array` without `as unknown`.
- Queue: `QueueMessage` discriminated (`src/types.ts:95`), `handleQueue(batch: MessageBatch<QueueMessage>)` (`src/index.ts:75`), idempotent processors, DLQ `memesbooru-dlq`.
- Cron: `0 * * * *` (`wrangler.jsonc:32`) → `scheduled` (`src/index.ts:78`) for `session cleanup` + `score recalc`.

## 10. Cursor & Query Building

- Single source: `src/helpers/cursor.ts` (`encodeCursor<T extends object>`, `decodeCursor<T>`, `assertValidCursor`). Re-exported by `post-repository.ts:21`.
- `QueryBuilder` (`src/helpers/query-builder.ts`) with `where(sql,...SqlParam[]) / whereIf / orderBy(allowed?) / paginate / build(): BuiltQuery` — use `allowed` whitelist, regex `/^[a-zA-Z0-9_.]+$/` for columns.

## 11. Frontend Vanilla

`src/client/` — vanilla TS + HTML + CSS (`vite` build, no React/Vue). SPA with `history.pushState`. No backend type imports (`src/client` never imports `src/types`); the frontend consumes the Zod response schemas in `src/validators.ts` via `safeParse`.

### 11.1 Views (7 + 404)

`src/client/app/router.ts` mounts: Catálogo `/`, Detalle `/post/:publicId`, Subir `/upload`, Favoritos `/favorites`, Configuración `/settings`, Perfil `/profile`, Aleatorio `/random` (redirect-to-detail), + 404. Moderación es TO DO. Login es redirect a Google OAuth, no vista SPA.

### 11.2 Shell & navigation (no full page reloads)

- `main.ts` boot: `applyTheme()` + **one** `getMe()` → cached in `store.user`. Never call `getMe` per render.
- Router renders a **persistent shell** (header + sub-nav) once; navigation only swaps `<main id="page">`. No `location.reload()` anywhere — actions update the DOM in place.
- **Global delegation** (bound once): `a[data-link]` navigation, plus home's `[data-ac]` (add tag), `[data-remove]` (remove tag), `[data-sort]`, `[data-page]` — so re-rendered content needs no re-binding.
- Post actions are in-place: vote/favorite refetch the post and update `#score-line` + `#stats`; a new comment is appended to `#comments-list`.

### 11.3 Booru catalog UI (Rule34-style)

- **Two-column home**: left sidebar (`#home-side` 210px) + main. Sidebar contains: search input + autocomplete dropdown, "Filter pools" toggle (placeholder, disabled), collapsible category groups with alphabetical tag list + usage counts. Main contains: search-toolbar (selected tag chips + sort buttons) + dense square grid + numeric paginator.
- **Single search input** lives in the sidebar (`#sidebar-tag-input`). The main area has NO duplicate search input. Input is synced with `store.query` on every render.
- **Sub-nav bar** (`site-subnav`) under the header: Posts / Upload / Random / Favorites. Targeted at publications + tags navigation (no wiki, no external sites, no comments index).
- Selected tags are buttons (`<span class="tag-chip">`) with `<a>` name + `×` close. Sort is `<button class="sort-btn on|">` Recientes/Populares.
- **Tag chaining**: typing space in the sidebar input commits prior tokens to `store.tags` (deduplicated via `Set`) and clears the input for the next tag — the user keeps typing in a single continuous string. Enter commits every token.
- **Multi-param tags in URL** (`?tags=choker&tags=wojak`), never `?tags=choker+wojak`. `buildUrl` uses `params.append('tags', t)`; `parseUrlIntoStore` uses `sp.getAll('tags').flatMap(s => s.split(/\s+/)).filter(Boolean)`. Server still receives space-joined `tags` in `SearchQuerySchema` (each item is whitespace-free post-normalize).
- Dense square thumbnail grid (no wrapping cards), numeric paginator `« 1 2 3 … »`. The backend stays cursor-paginated; the **client maps page↔cursor** in `store.ts` (`pages[]`, `cursorForPage(page)`, `recordPage`).
- Only `#results` (grid + paginator), `#selected-tags`, `#sort-row` re-render on search/tag/sort/page change (`home.ts loadResults`/`updateDom`). Sidebar is rendered once per home visit.
- Post detail: two-column layout with sidebar blocks `Statistics` (score/favs/comments/media/autor/fecha) + `Tagged` (tags grouped by category with usage counts, from `PostTagResult`).
- Tags are plain-text links with usage counts; comments show author + date.

### 11.4 Tag categories (memes domain)

5 categories, alphabetically ordered inside the sidebar (RULE34 pattern): `reaction` (pepe/wojak/doge), `source` (mangas/pelis/juegos), `people` (real people — políticos, famosos), `character` (personajes ficticios), `meta` (meta-tags — rare_tags/hd/wallpaper). Defined in `validators.ts` `TAG_CATEGORIES` and enforced by `CHECK` in `migrations/0002_tag_categories.sql` (table rebuilt to swap `general/copyright/series/artist` for the new set, remapping old rows). The R34-style sidebar labels are in `components/sidebar.ts` `CATEGORY_LABELS`.

### 11.5 Themes (user-selectable)

### 11.4 Themes (user-selectable)

4 light palettes in `styles/tokens.css` as `[data-theme="android"|"solarized"|"gruvbox"|"nord"]` (`android` default). Applied via `data-theme` on `<html>`, persisted in `localStorage` (`memesbooru.theme`), switched from `/settings` (`setTheme` in `state/store.ts`). All colors come from CSS custom properties — never hardcode hex in markup/components.

### 11.6 Modular CSS (no monolith)

`src/client/styles/index.css` imports only; split by category: `tokens.css` (font + palettes), `base.css`, `typography.css`, `layout.css`, `grid.css`, `post.css`, `forms.css`, `comments.css`, `sidebar.css`.

### 11.7 Design rules (anti-AI-slop)

Light utilitarian base (no dark-mode reflex), self-hosted `@fontsource/ibm-plex-sans` (Latin, bundled to `dist/`, no CDN; fallback `Helvetica, Arial, sans-serif`), `border-radius: var(--radius)` = 2px, no gradients/glassmorphism/pills/emojis/decorative icons, `prefers-reduced-motion` respected, real `:hover/:active/:focus-visible` states.

### 11.8 Services & state

- `services/api.ts`: `apiGet/apiPost` → `Schema.safeParse`, no `as` casts. Includes `browseTags(per)` for the tag sidebar.
- `state/store.ts`: user, query, tags, sort, theme, and pagination cursor history.
- `components/*` are pure render functions returning HTML strings; `pages/*` render + bind.

### 11.9 Tag browse endpoint

`GET /api/tags/browse?per=25` returns `BrowseTagsResponse = { groups: Record<Category, {tags: TagItem[]}> }` (one query via `ROW_NUMBER() OVER (PARTITION BY category)` over `tags WHERE status='active'`, ordered by `normalized_name ASC`). Cached `public, max-age=300`. Pagination per category is `GET /api/tags/browse/:category?limit&offset`. Migration 0002 rebuilds the `tags` table to enforce the 5-category `CHECK`.

## 12. Cloudflare Verification Rule

For any Cloudflare decision:
1. Consult `developers.cloudflare.com` (record date + URL)
2. Separate fact / decision / inference / unknown
3. If undocumented → `no confirmado`
4. Validate via benchmark or official support before architecting on it
Verified facts: `wrangler.jsonc` recommended, `wrangler types` generates `Env`, D1 `batch` sequential single-threaded, read replication needs Sessions API, R2 bindings via `env.MEDIA_BUCKET`, Queues batching/retries/DLQ, Rate Limiting eventually consistent.

## 13. Testing & Typecheck

```bash
npm run typecheck        # tsc --noEmit (strict, 0 unknown, 0 any in backend)
npm test                 # vitest run (pool @cloudflare/vitest-pool-workers, miniflare D1/R2/Queue)
npm run test:watch
wrangler types --check
wrangler deploy --dry-run
```

Tests cover domain, repositories, endpoints, auth/permissions, tags/aliases, pagination, media processing, queue idempotency, rate limiting.

## 14. Git & Commits

Conventional Commits, English, imperative: `refactor: ...` / `feat: ...` / `fix: ...` / `chore:` / `docs:` / `test:`. Body bullets `-` one line each. No `Co-Authored-By`. History: `refactor: adopt branded ids ...` / `refactor: replace unknown ...`. Default branch `main`, direct commits OK.

## 15. Maintenance Workflow

1. Update `schema.ts` + migration SQL before code.
2. Update `validators.ts` Zod schema, then `types.ts` inferred type, then repository → service → route.
3. Run `npm run cf-typegen` if `wrangler.jsonc` changed.
4. `npm run typecheck && npm test` before push.
5. Keep `PLAN.md` reference but code is truth.

## 16. Anti-Patterns — DO NOT

- `unknown` / `any` / `as unknown as` — use `SqlParam/JsonValue/ErrorDetails/QueueMessage/PostSearchResult`
- Inline anonymous `{id:number}` — use `Pick<ReportRow,'id'>` / `CreatedPostResult` / `NextIdRow` / `CountRow` / `InsertPostTagStatementData` (never `row: { postId: number; ... }` inline)
- SQL outside `src/repositories/*` or `c.env.DB` outside routes/`index.ts`
- Business logic in `src/http/routes/*` or Hono in `src/services/*`
- `SELECT *` on public endpoints, JSON columns for filterable data, `OFFSET` pagination, `ORDER BY RANDOM()`
- `location.reload()` in `src/client` — update the DOM in place (vote/fav/comment/search)
- Calling `getMe()` per render in `src/client` — fetch once into `store.user` at boot
- AI-slop UI: dark-mode reflex, Inter/system-ui/Poppins/Geist, `border-radius >= 8px` on cards/buttons, gradients/glassmorphism/pills/emojis, gray-bordered cards wrapping thumbnails, "load more" instead of the numeric paginator, hardcoded hex in markup instead of CSS tokens
- Monolithic `main.css` — keep the category-split `styles/*.css`
- Dual `types` files — keep monoliths `src/types.ts` + `src/validators.ts`
- New `src/server` / `src/shared` dirs from `PLAN.md` — actual layout is `src/db|domain|helpers|http|queues|repositories|services`
- `wrangler.toml` — use `wrangler.jsonc`

## 17. Quick Start for Agents

- Read `src/types.ts`, `src/validators.ts`, `src/db/schema.ts`, `src/db/client.ts`, `src/domain/errors.ts`, `src/index.ts` first.
- Follow `Repository-Service` + `satisfies` + `Branded` + `DeepReadonly` patterns above.
- If you need a type, it already exists in `types.ts`/`schema.ts`/`validators.ts` — import it, don't recreate with `unknown`.
