import { globMatch, registryUrl } from '#lib/registries.ts';
import type { Registry, RegistryConfig, RegistrySecrets } from '#lib/types.ts';
import { getRegistrySecrets } from '../store.ts';
import { environmentCredentials, ecrDeleteTag, ecrImages, ecrLogin, ecrRepositories, type AwsCredentials } from './aws.ts';
import { RegistryClient, RegistryError, type Credentials } from './distribution.ts';
import { enginePing } from './engine.ts';
import { ghcrRepositories, ghcrTags, githubLogin, hubCheck, hubRepositories, hubTags, type ListedTag } from './hub.ts';

export { RegistryError };

/** One registry, whatever its kind, as sync, the image page and downloads use it. */
export type Source = {
	/** The registry API, for manifests and blobs. Null for the Docker Engine, which has its own. */
	client: RegistryClient | null;
	/** Checks the connection and credentials; may fill in config the registry told us (ECR's account). */
	test(): Promise<Partial<RegistryConfig>>;
	repositories(): Promise<string[]>;
	/** Tags with their digests, newest first where the registry says. */
	tags(repo: string, max: number): Promise<ListedTag[]>;
	deleteTag(repo: string, tag: string, digest: string): Promise<void>;
	/** True when tags() already says size and platforms, so sync skips fetching manifests. */
	listsDetails: boolean;
};

const cache = new Map<string, Source>();

/** Drops the cached client (and its tokens) after the registry's settings change. */
export function forgetSource(id: string) {
	cache.delete(id);
}

export function sourceFor(r: Registry): Source {
	let s = cache.get(r.id);
	if (!s) {
		s = build(r);
		cache.set(r.id, s);
	}
	return s;
}

/** Discovered repositories plus the ones named in the settings, filtered by the include globs. */
export async function repositoriesOf(r: Registry, s: Source): Promise<string[]> {
	const named = (r.config.repositories ?? []).map((x) => x.trim()).filter(Boolean);
	let found: string[] = [];
	try {
		found = await s.repositories();
	} catch (err) {
		// A registry that can't list (no _catalog, or not for these credentials) still works with
		// named repositories; bad credentials show up when their tags are read.
		if (!named.length) throw err;
	}
	const all = [...new Set([...found, ...named])];
	const include = (r.config.include ?? []).filter((g) => g.trim());
	return include.length ? all.filter((repo) => include.some((g) => globMatch(g, repo))) : all;
}

/** Natural, newest-looking first: v1.10 before v1.9, `latest` on top. */
function versionSort(tags: string[]): string[] {
	return [...tags].sort((a, b) => (a === 'latest' ? -1 : b === 'latest' ? 1 : b.localeCompare(a, undefined, { numeric: true })));
}

/** For plain registries: list the tags, then HEAD each for its digest, a few at a time. */
async function headTags(client: RegistryClient, repo: string, max: number): Promise<ListedTag[]> {
	const names = versionSort(await client.tags(repo)).slice(0, max);
	const out: ListedTag[] = [];
	await pool(names, 8, async (tag) => {
		try {
			const { digest } = await client.resolve(repo, tag);
			out.push({ tag, digest, pushedAt: null });
		} catch (err) {
			// A tag deleted between listing and HEAD is fine to skip.
			if (!(err instanceof RegistryError && err.status === 404)) throw err;
		}
	});
	return out;
}

/** A source for checking settings before they're saved, with the secrets from the form. */
export function draftSource(r: Registry, secrets: () => RegistrySecrets): Source {
	return build(r, secrets);
}

function build(r: Registry, secrets: () => RegistrySecrets = () => getRegistrySecrets(r.id)): Source {
	const c = r.config;
	switch (r.kind) {
		case 'docker':
			return {
				client: null,
				test: async () => (await enginePing(), {}),
				repositories: async () => [],
				tags: async () => [],
				deleteTag: async () => {},
				listsDetails: true
			};

		case 'ecr': {
			const region = c.region || 'us-east-1';
			let creds: AwsCredentials | null = null;
			const aws = async (): Promise<AwsCredentials> => {
				if (c.awsAuth === 'environment') return environmentCredentials(region);
				const s = secrets();
				if (!s.accessKeyId || !s.secretAccessKey) throw new RegistryError('Add an access key ID and secret access key', 401);
				return (creds ??= { accessKeyId: s.accessKeyId, secretAccessKey: s.secretAccessKey, sessionToken: s.sessionToken });
			};
			let login: { username: string; password: string; expires: number } | null = null;
			const client = new RegistryClient(registryUrl('ecr', c), async (): Promise<Credentials> => {
				if (!login || login.expires - Date.now() < 30 * 60_000) login = await ecrLogin(region, await aws(), c.accountId || undefined);
				return login;
			});
			return {
				client,
				async test() {
					const l = await ecrLogin(region, await aws(), c.accountId || undefined);
					const accountId = new URL(l.endpoint).host.split('.')[0];
					return accountId !== c.accountId ? { accountId } : {};
				},
				repositories: async () => ecrRepositories(region, await aws(), c.accountId || undefined),
				async tags(repo, max) {
					const images = await ecrImages(repo, region, await aws(), c.accountId || undefined);
					const out: ListedTag[] = [];
					for (const i of images.sort((a, b) => (b.imagePushedAt ?? 0) - (a.imagePushedAt ?? 0)))
						for (const tag of i.imageTags ?? [])
							out.push({ tag, digest: i.imageDigest, pushedAt: i.imagePushedAt ? new Date(i.imagePushedAt * 1000).toISOString() : null });
					return out.slice(0, max);
				},
				deleteTag: async (repo, tag) => ecrDeleteTag(repo, tag, region, await aws(), c.accountId || undefined),
				listsDetails: false
			};
		}

		case 'dockerhub': {
			const user = c.username || undefined;
			const client = new RegistryClient(registryUrl('dockerhub', c), async () => {
				const s = secrets();
				return user && s.password ? { username: user, password: s.password } : null;
			});
			return {
				client,
				test: async () => (await hubCheck(user, secrets().password), {}),
				async repositories() {
					const namespaces = (c.namespaces?.length ? c.namespaces : user ? [user] : []).map((n) => n.trim()).filter(Boolean);
					const out: string[] = [];
					for (const ns of namespaces) out.push(...(await hubRepositories(ns, user, secrets().password)));
					return out;
				},
				tags: async (repo, max) => hubTags(repo.includes('/') ? repo : `library/${repo}`, max, user, secrets().password),
				deleteTag: async () => {
					throw new RegistryError('Delete tags on hub.docker.com', 400);
				},
				listsDetails: true
			};
		}

		case 'ghcr': {
			const self = !c.owner;
			const client = new RegistryClient(registryUrl('ghcr', c), async () => {
				const s = secrets();
				return s.password ? { username: c.username || c.owner || 'token', password: s.password } : null;
			});
			return {
				client,
				async test() {
					const token = secrets().password;
					if (!token) throw new RegistryError('Add a GitHub token with read:packages', 401);
					await githubLogin(token);
					return {};
				},
				async repositories() {
					const token = secrets().password;
					const owner = c.owner || (token ? await githubLogin(token) : '');
					if (!owner) return [];
					return ghcrRepositories(owner, c.ownerType, token, self);
				},
				async tags(repo, max) {
					// Repositories named by hand may belong to someone else's public packages: read them from the registry.
					try {
						return await ghcrTags(repo, c.ownerType, secrets().password, self, max);
					} catch (err) {
						if (err instanceof RegistryError && err.status === 404) return headTags(client, repo, max);
						throw err;
					}
				},
				deleteTag: async () => {
					throw new RegistryError('Delete package versions on github.com', 400);
				},
				listsDetails: false
			};
		}

		default: {
			const url = registryUrl('registry', c);
			if (!url) throw new RegistryError('Set the registry URL', 400);
			const client = new RegistryClient(url, async () => {
				const s = secrets();
				return c.username && s.password ? { username: c.username, password: s.password } : null;
			});
			return {
				client,
				test: async () => (await client.ping(), {}),
				repositories: () => client.catalog(),
				tags: (repo, max) => headTags(client, repo, max),
				deleteTag: (repo, _tag, digest) => client.deleteManifest(repo, digest),
				listsDetails: false
			};
		}
	}
}

/** Runs fn over items, at most `n` at a time. */
export async function pool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (i < items.length) await fn(items[i++]);
		})
	);
}
