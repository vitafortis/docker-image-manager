import { platformString } from '#lib/registries.ts';
import type { Registry } from '#lib/types.ts';
import { engineImages, engineInspect, splitEngineTag } from './registry/engine.ts';
import { pool, repositoriesOf, sourceFor, RegistryError } from './registry/index.ts';
import {
	getRegistry,
	getSettings,
	knownDigests,
	listRegistries,
	logActivity,
	pruneIndex,
	replaceTags,
	saveManifest,
	setRegistryStatus,
	syncing,
	updateRegistry,
	type TagInput
} from './store.ts';

const running = new Map<string, Promise<SyncResult>>();

export type SyncResult = { repos: number; tags: number; errors: string[] };

/** Syncs one registry; a sync already running for it is joined rather than started twice. */
export function syncRegistry(id: string, actor: string | null = null): Promise<SyncResult> {
	const existing = running.get(id);
	if (existing) return existing;
	const p = run(id, actor).finally(() => {
		running.delete(id);
		syncing.delete(id);
	});
	running.set(id, p);
	syncing.add(id);
	return p;
}

async function run(id: string, actor: string | null): Promise<SyncResult> {
	const r = getRegistry(id);
	if (!r) throw new RegistryError('No such registry', 404);
	const started = Date.now();
	try {
		const result = r.kind === 'docker' ? await syncEngine(r) : await syncRemote(r);
		const failed = result.errors.length > 0 && result.repos === 0;
		setRegistryStatus(id, failed ? 'error' : 'ok', result.errors.length ? summarize(result.errors) : null, !failed);
		logActivity('registry.sync', {
			actor,
			target: r.name,
			detail: `${result.repos} repositories, ${result.tags} tags in ${((Date.now() - started) / 1000).toFixed(1)} s${result.errors.length ? `; ${result.errors.length} errors` : ''}`
		});
		return result;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		setRegistryStatus(id, 'error', msg);
		logActivity('registry.sync-failed', { actor, target: r.name, detail: msg });
		throw err;
	}
}

function summarize(errors: string[]): string {
	return errors.length === 1 ? errors[0] : `${errors[0]} (and ${errors.length - 1} more)`;
}

async function syncRemote(r: Registry): Promise<SyncResult> {
	const source = sourceFor(r);
	const { maxTagsPerRepo } = getSettings();
	// ECR tells us its account on the first connect; keep it for the pull references.
	const fill = await source.test();
	if (Object.keys(fill).length) updateRegistry(r.id, { config: { ...r.config, ...fill } });
	const repos = await repositoriesOf(r, source);
	const errors: string[] = [];
	let tagCount = 0;
	const synced: string[] = [];
	await pool(repos, 4, async (repo) => {
		try {
			const listed = await source.tags(repo, maxTagsPerRepo);
			const tags: TagInput[] = listed.map((t) => ({ tag: t.tag, digest: t.digest, pushedAt: t.pushedAt }));
			const known = knownDigests(r.id, repo);
			if (source.listsDetails) {
				for (const t of listed)
					if (!known.has(t.digest)) {
						known.add(t.digest);
						saveManifest(r.id, repo, { digest: t.digest, mediaType: null, size: t.size ?? null, created: null, configDigest: null, platforms: t.platforms ?? [], labels: {} });
					}
			} else if (source.client) {
				const fresh = [...new Set(listed.map((t) => t.digest))].filter((d) => !known.has(d));
				await pool(fresh, 6, async (digest) => {
					try {
						saveManifest(r.id, repo, await source.client!.summarize(repo, digest));
					} catch (err) {
						// The tag still goes in the index; the image page fetches details on demand.
						errors.push(`${repo}@${digest.slice(7, 19)}: ${(err as Error).message}`);
					}
				});
			}
			replaceTags(r.id, repo, tags);
			tagCount += tags.length;
			synced.push(repo);
		} catch (err) {
			if (err instanceof RegistryError && err.status === 401) throw err;
			errors.push(`${repo}: ${(err as Error).message}`);
		}
	});
	// Repositories that failed this time keep what the index had.
	const failedRepos = repos.filter((x) => !synced.includes(x));
	pruneIndex(r.id, [...synced, ...failedRepos]);
	return { repos: synced.length, tags: tagCount, errors };
}

async function syncEngine(r: Registry): Promise<SyncResult> {
	const images = await engineImages();
	const byRepo = new Map<string, TagInput[]>();
	for (const img of images) {
		const tags = (img.RepoTags ?? []).filter((t) => t !== '<none>:<none>');
		const pushedAt = new Date(img.Created * 1000).toISOString();
		const entries = tags.length ? tags.map(splitEngineTag) : [{ repo: '<none>', tag: img.Id.slice(7, 19) }];
		for (const { repo, tag } of entries) {
			if (!byRepo.has(repo)) byRepo.set(repo, []);
			byRepo.get(repo)!.push({ tag, digest: img.Id, pushedAt });
		}
	}
	const errors: string[] = [];
	await pool([...byRepo.keys()], 4, async (repo) => {
		const have = knownDigests(r.id, repo);
		for (const t of byRepo.get(repo)!) {
			if (have.has(t.digest)) continue;
			have.add(t.digest);
			try {
				const i = await engineInspect(t.digest);
				saveManifest(r.id, repo, {
					digest: t.digest,
					mediaType: 'docker-engine',
					size: i.Size,
					created: i.Created,
					configDigest: i.Id,
					platforms: [platformString({ os: i.Os, architecture: i.Architecture, variant: i.Variant })],
					labels: i.Config.Labels ?? {}
				});
			} catch (err) {
				errors.push(`${repo}: ${(err as Error).message}`);
			}
		}
		replaceTags(r.id, repo, byRepo.get(repo)!);
	});
	pruneIndex(r.id, [...byRepo.keys()]);
	return { repos: byRepo.size, tags: [...byRepo.values()].reduce((n, t) => n + t.length, 0), errors };
}

let timer: ReturnType<typeof setInterval> | undefined;
const lastAuto = new Map<string, number>();

/** Checks every minute which registries are due for their periodic sync. */
export function startScheduler() {
	if (timer) return;
	timer = setInterval(tick, 60_000);
	timer.unref?.();
	// A first pass shortly after start, for registries that have never synced or are overdue.
	setTimeout(tick, 5_000).unref?.();
}

function tick() {
	const { syncMinutes } = getSettings();
	if (!syncMinutes) return;
	const now = Date.now();
	for (const r of listRegistries()) {
		const last = Math.max(r.syncedAt ? Date.parse(r.syncedAt) : 0, lastAuto.get(r.id) ?? 0);
		if (now - last < syncMinutes * 60_000 || running.has(r.id)) continue;
		lastAuto.set(r.id, now);
		syncRegistry(r.id).catch((err) => console.warn(`[wharf] sync of ${r.name} failed:`, err.message));
	}
}
