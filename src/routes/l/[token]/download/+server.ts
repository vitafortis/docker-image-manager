import { error } from '@sveltejs/kit';
import { archiveResponse, imageArchive } from '#lib/server/archive.ts';
import { throttled } from '#lib/server/auth.ts';
import { findLink } from '#lib/server/links.ts';
import { claimLinkDownload, getRegistry, logActivity, releaseLinkDownload } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/**
 * Downloads through a share link. The download is claimed before anything is sent, so two
 * requests can't both use a one-time link; if the registry fails before the file starts, the
 * claim is given back. A download that breaks off midway still counts.
 */
export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	if (throttled(`link:${getClientAddress()}`, 30)) error(429, 'Too many requests; wait a few minutes');
	const link = findLink(params.token);
	if (!link || link.state !== 'active') error(404, 'This link has expired or been used');
	const r = getRegistry(link.registryId);
	if (!r) error(404, 'This link has expired or been used');
	if (!claimLinkDownload(link.id)) error(410, 'This link has expired or been used');
	let ip = '';
	try {
		ip = getClientAddress();
	} catch {}
	try {
		const archive = await imageArchive(r, link.repo, link.digest ?? link.ref, link.platform);
		logActivity('link.download', { actor: ip ? `link from ${ip}` : 'link', target: `${r.name}: ${link.repo}:${link.ref}`, detail: archive.filename });
		return archiveResponse(archive, (ok) => {
			if (!ok) logActivity('link.download-failed', { actor: ip ? `link from ${ip}` : 'link', target: `${r.name}: ${link.repo}:${link.ref}` });
		});
	} catch (err) {
		releaseLinkDownload(link.id);
		console.warn('[berth] share link download failed:', (err as Error).message);
		error(502, "The registry couldn't send this image right now; try again in a moment");
	}
};
