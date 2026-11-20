import { indexTotals, searchImages } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const q = url.searchParams.get('q')?.slice(0, 500) ?? '';
	const registry = url.searchParams.get('registry') ?? '';
	return { q, registry, ...searchImages({ q, registryId: registry || undefined, limit: 100 }), totals: indexTotals() };
};
