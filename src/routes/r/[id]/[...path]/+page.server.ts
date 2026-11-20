import { error } from '@sveltejs/kit';
import { imageDetail } from '#lib/server/images.ts';
import { findImage, getRegistry, listRepos, repoTags } from '#lib/server/store.ts';
import { parsePath } from '#lib/registries.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const registry = getRegistry(params.id);
	if (!registry) error(404, 'No such registry');
	const { repo, ref } = parsePath(params.path ?? '');
	if (!repo) return { view: 'registry' as const, registry, repos: listRepos(registry.id) };
	if (!ref) {
		const tags = repoTags(registry.id, repo);
		return { view: 'repo' as const, registry, repo, tags };
	}
	const indexed = findImage(registry.id, repo, ref) ?? null;
	try {
		return { view: 'image' as const, registry, repo, ref, indexed, detail: await imageDetail(registry, repo, ref), error: null };
	} catch (err) {
		return { view: 'image' as const, registry, repo, ref, indexed, detail: null, error: err instanceof Error ? err.message : String(err) };
	}
};
