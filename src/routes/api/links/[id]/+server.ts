import { json } from '@sveltejs/kit';
import { handler, NotFound } from '#lib/server/http.ts';
import { deleteLink, getLink, logActivity, revokeLink } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

/** Revokes the link: it stops working at once, and stays listed. */
export const POST: RequestHandler = handler(({ params, locals }) => {
	const l = getLink(params.id);
	if (!l) throw new NotFound('No such link');
	revokeLink(l.id);
	logActivity('link.revoke', { actor: locals.user?.email, target: `${l.repo}:${l.ref}` });
	return json({ link: getLink(l.id) });
});

export const DELETE: RequestHandler = handler(({ params }) => {
	if (!deleteLink(params.id)) throw new NotFound('No such link');
	return json({ ok: true });
});
