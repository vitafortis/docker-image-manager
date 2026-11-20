import { archiveResponse, imageArchive } from '#lib/server/archive.ts';
import { BadRequest, handler, NotFound } from '#lib/server/http.ts';
import { getRegistry, logActivity } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Streams an image as a tar for `docker load`. ?platform=linux/arm64 picks one of a multi-platform image. */
export const GET: RequestHandler = handler(async ({ url, locals }) => {
	const p = url.searchParams;
	const r = getRegistry(p.get('registry') ?? '');
	if (!r) throw new NotFound('No such registry');
	const repo = p.get('repo');
	const ref = p.get('ref');
	if (!repo || !ref) throw new BadRequest('repo and ref are required');
	const archive = await imageArchive(r, repo, ref, p.get('platform') || null);
	logActivity('image.download', { actor: locals.user?.email, target: `${r.name}: ${repo}:${ref}`, detail: archive.filename });
	return archiveResponse(archive);
});
