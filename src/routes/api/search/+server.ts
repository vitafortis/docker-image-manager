import { json } from '@sveltejs/kit';
import { handler } from '#lib/server/http.ts';
import { searchImages } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = handler(({ url }) => {
	const q = url.searchParams.get('q')?.slice(0, 500) ?? '';
	const registryId = url.searchParams.get('registry') || undefined;
	const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
	const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || 100));
	return json(searchImages({ q, registryId, offset, limit }));
});
