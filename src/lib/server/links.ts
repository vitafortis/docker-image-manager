import { randomToken, sha256 } from './crypto.ts';
import { createLink, getSettings, linkByTokenHash } from './store.ts';
import type { ShareLink } from '#lib/types.ts';

/**
 * Share links download one image without signing in. The token is shown once, when the link is
 * made; only its hash is stored, so a copy of the database can't be turned into working links.
 */
export function makeLink(input: Omit<Parameters<typeof createLink>[0], 'tokenHash'>): { link: ShareLink; token: string } {
	const token = randomToken(24);
	return { link: createLink({ ...input, tokenHash: sha256(token) }), token };
}

export function findLink(token: string): ShareLink | undefined {
	if (!/^[\w-]{16,64}$/.test(token)) return undefined;
	return linkByTokenHash(sha256(token));
}

/** The address links are shared at: Settings' public URL, else the one this request came in on. */
export function linkUrl(origin: string, token: string): string {
	const base = getSettings().publicUrl.replace(/\/+$/, '') || origin;
	return `${base}/l/${token}`;
}
