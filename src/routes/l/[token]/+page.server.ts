import { error } from '@sveltejs/kit';
import { findLink } from '#lib/server/links.ts';
import { findImage, getRegistry } from '#lib/server/store.ts';
import { pullRef } from '#lib/registries.ts';
import type { PageServerLoad } from './$types';

/** The page a share link opens: what the image is, how long the link lasts, and the download. */
export const load: PageServerLoad = ({ params }) => {
	const link = findLink(params.token);
	const r = link && getRegistry(link.registryId);
	if (!link || !r) error(404, 'This link does not exist');
	const img = findImage(r.id, link.repo, link.digest ?? link.ref);
	return {
		state: link.state,
		image: pullRef(r.host, link.repo, link.ref),
		digest: link.digest ?? img?.digest ?? null,
		follow: link.digest === null,
		platform: link.platform,
		platforms: img?.platforms ?? [],
		size: img?.size ?? null,
		created: img?.created ?? null,
		note: link.note,
		expiresAt: link.expiresAt,
		remaining: link.maxDownloads === null ? null : Math.max(0, link.maxDownloads - link.downloads),
		filename: `${link.repo.split('/').pop()}_${link.ref.replace(/^sha256:/, '').slice(0, 20)}.tar`
	};
};
