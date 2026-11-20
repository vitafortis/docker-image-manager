/**
 * The search box's language. Bare words match a repository, a tag or a digest; `key:value`
 * narrows to one field; a Docker reference (`nginx:1.27`, `app@sha256:…`) matches as one.
 *
 *   nginx 1.27            repo or tag contains both
 *   sha256:3f2a / 3f2a9c  digest or image ID starts with it
 *   tag:v1.*              tag matches the glob
 *   repo:api registry:ecr arch:arm64 label:org.opencontainers.image.source=*acme*
 */
export type SearchField = 'any' | 'repo' | 'tag' | 'digest' | 'registry' | 'arch' | 'label' | 'ref';

export type SearchTerm = { field: SearchField; value: string; negate?: boolean };

const KEYS: Record<string, SearchField> = {
	repo: 'repo',
	repository: 'repo',
	image: 'repo',
	name: 'repo',
	tag: 'tag',
	sha: 'digest',
	digest: 'digest',
	id: 'digest',
	registry: 'registry',
	reg: 'registry',
	arch: 'arch',
	platform: 'arch',
	label: 'label'
};

export const SEARCH_KEYS = Object.keys(KEYS);

const HEX = /^(?:sha256:)?[0-9a-f]{6,64}$/i;

/** Splits on whitespace, keeping "quoted phrases" (and key:"quoted values") together. */
function tokens(q: string): string[] {
	const out: string[] = [];
	const re = /(-?[\w.-]+:)?"([^"]*)"|\S+/g;
	for (const m of q.matchAll(re)) out.push(m[2] !== undefined ? `${m[1] ?? ''}${m[2]}` : m[0]);
	return out;
}

export function parseSearch(q: string): SearchTerm[] {
	const terms: SearchTerm[] = [];
	for (let tok of tokens(q.trim())) {
		let negate = false;
		if (tok.startsWith('-') && tok.length > 1) {
			negate = true;
			tok = tok.slice(1);
		}
		const colon = tok.indexOf(':');
		const key = colon > 0 ? tok.slice(0, colon).toLowerCase() : '';
		if (key && KEYS[key]) {
			const value = tok.slice(colon + 1);
			if (value) terms.push({ field: KEYS[key], value, negate });
			continue;
		}
		if (HEX.test(tok)) {
			terms.push({ field: 'digest', value: tok, negate });
			continue;
		}
		// nginx:1.27 or app@sha256:… is a reference: the repo, then a tag or a digest.
		if (/^[a-z0-9][\w./-]*[:@]./i.test(tok) && key !== 'sha256') {
			terms.push({ field: 'ref', value: tok, negate });
			continue;
		}
		terms.push({ field: 'any', value: tok, negate });
	}
	return terms;
}

/** `v1.*` → `v1.%` for LIKE, with LIKE's own wildcards escaped. No `*` means "contains". */
export function likePattern(value: string, { anchored = false } = {}): string {
	const esc = value.replace(/[\\%_]/g, (c) => `\\${c}`);
	if (esc.includes('*')) return esc.replace(/\*/g, '%');
	return anchored ? esc : `%${esc}%`;
}

/** A digest or ID as typed (with or without `sha256:`) → the LIKE prefix to match stored digests. */
export function digestPrefix(value: string): string {
	const hex = value.toLowerCase().replace(/^sha256:/, '');
	return `sha256:${hex.replace(/[\\%_]/g, '')}%`;
}

/** Splits a reference into repo and tag-or-digest: `a/b:1` → ['a/b', ':1'], `a@sha256:x` → ['a', '@sha256:x']. */
export function splitRef(ref: string): { repo: string; tag: string | null; digest: string | null } {
	const at = ref.indexOf('@');
	if (at > 0) return { repo: ref.slice(0, at), tag: null, digest: ref.slice(at + 1) };
	const colon = ref.lastIndexOf(':');
	// A colon before the last slash is a registry port (localhost:5000/app), not a tag.
	if (colon > ref.lastIndexOf('/')) return { repo: ref.slice(0, colon), tag: ref.slice(colon + 1), digest: null };
	return { repo: ref, tag: null, digest: null };
}
