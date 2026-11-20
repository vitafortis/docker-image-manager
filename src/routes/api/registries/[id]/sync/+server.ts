import { json } from '@sveltejs/kit';
import { handler, NotFound } from '#lib/server/http.ts';
import { getRegistry } from '#lib/server/store.ts';
import { syncRegistry } from '#lib/server/sync.ts';
import type { RequestHandler } from './$types';

/** Syncs now and answers when it's done (anyone signed in can refresh the index). */
export const POST: RequestHandler = handler(async ({ params, locals }) => {
	if (!getRegistry(params.id)) throw new NotFound('No such registry');
	const result = await syncRegistry(params.id, locals.user?.email);
	return json({ result, registry: getRegistry(params.id) });
});
