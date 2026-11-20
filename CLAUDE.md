# Berth

- SvelteKit 3 + Svelte 5 runes + Tailwind 4, built with adapter-node; `server.js` drops root and loads `build/index.js`.
- The theme is the shared ·modern palette (pg-modern, octo-modern, debrief, Orbital) with primary hue 200. Keep `src/app.css` in step with those projects rather than inventing new tokens.
- Registries: `src/lib/server/registry/`. Everything that speaks the registry API goes through `RegistryClient` (distribution.ts); ECR, Docker Hub and GitHub only add how repositories and tags are listed (aws.ts, hub.ts); the Docker Engine (engine.ts) has its own path in sync, detail and download. `sourceFor()` in index.ts is the one place that picks between them.
- The index (SQLite, `store.ts`) keeps tags and, per digest, a summary of the manifest. Digests never change, so sync only fetches manifests it hasn't seen. The image page reads the registry live.
- Downloads (`archive.ts`) stream a tar that is both the OCI image layout and `docker save`'s manifest.json, with exact Content-Length and every blob checked against its digest on the way through.
- Share links store only the token's hash; `claimLinkDownload` takes a download atomically before anything is sent.
- No AWS SDK: `signV4` in aws.ts signs the three ECR calls; keep its test vector passing.
- Checks: `pnpm check`, `pnpm test`, `pnpm build`.
