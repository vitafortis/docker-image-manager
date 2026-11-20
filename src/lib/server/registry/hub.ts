import { RegistryError } from './distribution.ts';

/**
 * Docker Hub and GitHub list repositories and tags through their own APIs (neither offers the
 * registry's _catalog). Both also say each tag's digest and push time, so syncing needs no
 * manifest requests, which on Docker Hub would count against the pull rate limit.
 */

export type ListedTag = { tag: string; digest: string; pushedAt: string | null; size?: number | null; platforms?: string[] };

async function getJson<T>(url: string, headers: Record<string, string>, what: string): Promise<{ data: T; res: Response }> {
	let res: Response;
	try {
		res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(30_000) });
	} catch (err) {
		throw new RegistryError(`Can't reach ${new URL(url).host}: ${(err as Error).message}`);
	}
	if (res.status === 401 || res.status === 403) throw new RegistryError(`${what}: access denied`, 401);
	if (res.status === 404) throw new RegistryError(`${what}: not found`, 404);
	if (res.status === 429) throw new RegistryError(`${what}: rate limited, try again later`, 429);
	if (!res.ok) throw new RegistryError(`${what} answered ${res.status}`);
	return { data: (await res.json()) as T, res };
}

/* ---------- Docker Hub ---------- */

const HUB = 'https://hub.docker.com';
const hubTokens = new Map<string, { token: string; expires: number }>();

/** A Hub API token for a username and password or access token (good for a while; renewed after 10 minutes). */
async function hubToken(username?: string, password?: string): Promise<Record<string, string>> {
	if (!username || !password) return {};
	const key = `${username}:${password}`;
	const cached = hubTokens.get(key);
	if (cached && cached.expires > Date.now()) return { authorization: `Bearer ${cached.token}` };
	const res = await fetch(`${HUB}/v2/users/login`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ username, password }),
		signal: AbortSignal.timeout(15_000)
	}).catch((err) => {
		throw new RegistryError(`Can't reach Docker Hub: ${err.message}`);
	});
	if (!res.ok) throw new RegistryError('Docker Hub refused this username and token', 401);
	const { token } = (await res.json()) as { token: string };
	hubTokens.set(key, { token, expires: Date.now() + 10 * 60_000 });
	return { authorization: `Bearer ${token}` };
}

export async function hubCheck(username?: string, password?: string) {
	await hubToken(username, password);
}

export async function hubRepositories(namespace: string, username?: string, password?: string): Promise<string[]> {
	const headers = await hubToken(username, password);
	const out: string[] = [];
	let next: string | null = `${HUB}/v2/namespaces/${encodeURIComponent(namespace)}/repositories?page_size=100`;
	while (next) {
		const { data }: { data: { results: { name: string; namespace?: string }[]; next: string | null } } = await getJson(next, headers, `Docker Hub namespace ${namespace}`);
		out.push(...data.results.map((r) => `${r.namespace ?? namespace}/${r.name}`));
		next = data.next;
	}
	return out;
}

type HubTag = {
	name: string;
	digest?: string;
	full_size?: number;
	tag_last_pushed?: string;
	last_updated?: string;
	images?: { architecture: string; os: string; variant?: string | null; digest?: string; size?: number }[];
};

export async function hubTags(repo: string, max: number, username?: string, password?: string): Promise<ListedTag[]> {
	const headers = await hubToken(username, password);
	const [ns, ...rest] = repo.split('/');
	const out: ListedTag[] = [];
	let next: string | null = `${HUB}/v2/namespaces/${encodeURIComponent(ns)}/repositories/${encodeURIComponent(rest.join('/'))}/tags?page_size=100&ordering=last_updated`;
	while (next && out.length < max) {
		const { data }: { data: { results: HubTag[]; next: string | null } } = await getJson(next, headers, `Docker Hub ${repo}`);
		for (const t of data.results) {
			// Single-platform tags carry their digest on the one image; multi-platform ones on the tag.
			const digest = t.digest ?? (t.images?.length === 1 ? t.images[0].digest : undefined);
			if (!digest) continue;
			const images = (t.images ?? []).filter((i) => i.os !== 'unknown');
			out.push({
				tag: t.name,
				digest,
				pushedAt: t.tag_last_pushed ?? t.last_updated ?? null,
				size: images.length ? Math.max(...images.map((i) => i.size ?? 0)) : (t.full_size ?? null),
				platforms: images.map((i) => [i.os, i.architecture, i.variant].filter(Boolean).join('/'))
			});
		}
		next = data.next;
	}
	return out.slice(0, max);
}

/* ---------- GitHub Packages ---------- */

const GH = 'https://api.github.com';
const ghHeaders = (token?: string): Record<string, string> => ({
	accept: 'application/vnd.github+json',
	'x-github-api-version': '2022-11-28',
	...(token ? { authorization: `Bearer ${token}` } : {})
});

/** Who the token belongs to, to check it works (and as the owner when none is set). */
export async function githubLogin(token: string): Promise<string> {
	const { data } = await getJson<{ login: string }>(`${GH}/user`, ghHeaders(token), 'GitHub');
	return data.login;
}

function ownerPath(owner: string, ownerType: 'user' | 'org' | undefined, self: boolean): string {
	if (self) return `${GH}/user`;
	return `${GH}/${ownerType === 'org' ? 'orgs' : 'users'}/${encodeURIComponent(owner)}`;
}

/** ghcr.io repositories are `<owner>/<package>`, lower-cased. */
export async function ghcrRepositories(owner: string, ownerType: 'user' | 'org' | undefined, token: string | undefined, self: boolean): Promise<string[]> {
	const out: string[] = [];
	let next: string | null = `${ownerPath(owner, ownerType, self)}/packages?package_type=container&per_page=100`;
	while (next) {
		const { data, res }: { data: { name: string; owner?: { login: string } }[]; res: Response } = await getJson(next, ghHeaders(token), `GitHub packages of ${owner}`);
		out.push(...data.map((p) => `${(p.owner?.login ?? owner).toLowerCase()}/${p.name.toLowerCase()}`));
		next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
	}
	return out;
}

export async function ghcrTags(repo: string, ownerType: 'user' | 'org' | undefined, token: string | undefined, self: boolean, max: number): Promise<ListedTag[]> {
	const [owner, ...rest] = repo.split('/');
	const name = encodeURIComponent(rest.join('/'));
	const out: ListedTag[] = [];
	let next: string | null = `${ownerPath(owner, ownerType, self)}/packages/container/${name}/versions?per_page=100`;
	while (next && out.length < max) {
		const { data, res }: { data: { name: string; updated_at?: string; created_at?: string; metadata?: { container?: { tags?: string[] } } }[]; res: Response } = await getJson(
			next,
			ghHeaders(token),
			`GitHub package ${repo}`
		);
		for (const v of data) for (const tag of v.metadata?.container?.tags ?? []) out.push({ tag, digest: v.name, pushedAt: v.updated_at ?? v.created_at ?? null });
		next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') ?? '')?.[1] ?? null;
	}
	return out.slice(0, max);
}
