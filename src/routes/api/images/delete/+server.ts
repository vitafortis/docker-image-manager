import { json } from '@sveltejs/kit';
import { body, handler, NotFound, requireAdmin, str } from '#lib/server/http.ts';
import { deleteTag } from '#lib/server/images.ts';
import { getRegistry } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = handler(async ({ request, locals }) => {
	requireAdmin(locals);
	const b = await body(request);
	const r = getRegistry(str(b, 'registryId', { required: true })!);
	if (!r) throw new NotFound('No such registry');
	const result = await deleteTag(r, str(b, 'repo', { required: true, max: 300 })!, str(b, 'tag', { required: true, max: 200 })!, locals.user?.email ?? null);
	return json(result);
});
