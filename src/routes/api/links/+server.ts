import { json } from '@sveltejs/kit';
import { BadRequest, body, handler, int, NotFound, str } from '#lib/server/http.ts';
import { linkUrl, makeLink } from '#lib/server/links.ts';
import { RegistryError, sourceFor } from '#lib/server/registry/index.ts';
import { findImage, getRegistry, listLinks, logActivity } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => json({ links: listLinks() });

/**
 * Makes a share link. `hours` 0 and `maxDownloads` 0 mean no limit; `follow` leaves it on the
 * tag (whatever it points at when downloaded) instead of pinning today's digest.
 */
export const POST: RequestHandler = handler(async ({ request, locals }) => {
	const b = await body(request);
	const r = getRegistry(str(b, 'registryId', { required: true })!);
	if (!r) throw new NotFound('No such registry');
	const repo = str(b, 'repo', { required: true, max: 300 })!;
	const ref = str(b, 'ref', { required: true, max: 200 })!;
	const hours = int(b, 'hours', { min: 0, max: 24 * 365 }) ?? 24;
	const maxDownloads = int(b, 'maxDownloads', { min: 0, max: 10_000 }) ?? 1;
	if (!hours && !maxDownloads) throw new BadRequest('A link needs an expiry, a download limit, or both');
	const follow = b.follow === true && !ref.startsWith('sha256:');
	let digest: string | null = null;
	if (!follow) {
		digest = ref.startsWith('sha256:') ? ref : (findImage(r.id, repo, ref)?.digest ?? null);
		if (!digest && r.kind !== 'docker') digest = (await sourceFor(r).client!.resolve(repo, ref)).digest;
		if (!digest) throw new RegistryError(`${repo}:${ref} isn't in the index; sync the registry first`, 404);
	}
	const { link, token } = makeLink({
		registryId: r.id,
		repo,
		ref,
		digest,
		platform: str(b, 'platform', { max: 60 }),
		note: str(b, 'note', { max: 200 }),
		createdBy: locals.user?.email ?? null,
		expiresAt: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null,
		maxDownloads: maxDownloads || null
	});
	logActivity('link.create', {
		actor: locals.user?.email,
		target: `${r.name}: ${repo}:${ref}`,
		detail: [hours ? `expires in ${hours} h` : null, maxDownloads ? `${maxDownloads} download${maxDownloads === 1 ? '' : 's'}` : null].filter(Boolean).join(', ')
	});
	return json({ link, url: linkUrl(locals.origin, token) });
});
