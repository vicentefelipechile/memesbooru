# Memesbooru booru redesign

## Interface contract

- Flush-left brand, primary navigation and secondary strip; pending navigation is visible and disabled with TODO labels.
- Cyan background, narrow left search/tag column, uncropped thumbnails in regular rows, compact numeric pagination.
- Search submits on Enter/Buscar. Spaces do not navigate. Autocomplete completes the last token. `+` includes a tag; `−` excludes it.
- Sidebar tags are the distinct active tags on the current result page; counts are global catalog usage. No hard-coded example tags or image recognition.
- Search, sort and pagination update results and tags together. Cursor URLs support reloads and shared pages. Unknown page-only links normalize to page 1 rather than mislabel its results.
- Detail has a left statistics/tag column, with media and comments on the right. Mobile search precedes the grid; tags collapse.

## Cloudflare verification — 2026-09-22

Source: https://developers.cloudflare.com/d1/platform/limits/

- Fact: D1 documents a maximum of 100 bound parameters per query.
- Decision: validate at most 40 search terms; page size remains capped at 60. The page-tag query binds only the returned page IDs. Search uses parameterized tag predicates plus cursor/limit parameters, with no capped candidate-ID list.
- Inference: existing tag/post indexes should support the predicates; no new indexes or bindings are introduced.
- Unknown: latency at production-scale data is not confirmed by the small integration fixture. Measure against representative data before making throughput claims.

## Verification

`npm run typecheck`, `npm test`, `npm run build`.

Search integration checks use D1 and cover contextual tags, positive intersection, exclusion, aliases, empty results, end-of-pagination and malformed cursors. UI regression checks cover search markup, exact counters, known-page links and cursor history replacement.

Browser smoke check: Edge headless at 924px and 390px using mocked SFW image/API fixtures. Verified uncropped images, left-column geometry, no horizontal overflow, collapsed mobile tags, explicit search, autocomplete, exclusion, cursor reloads, back navigation and left-aligned detail statistics. Fixture screenshots validate layout, not the production catalog's media.

API navigation routing: `wrangler.jsonc` sends `/api/*` to the Worker before SPA asset fallback. This is required for browser navigations such as Google OAuth, because `single-page-application` otherwise serves `index.html` for the API URL.
