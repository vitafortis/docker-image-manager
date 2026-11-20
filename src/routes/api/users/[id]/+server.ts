import { json } from '@sveltejs/kit';
import { BadRequest, body, handler, NotFound, requireAdmin } from '#lib/server/http.ts';
import { countAdmins, deleteUser, getUser, logActivity, updateUser } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const PATCH: RequestHandler = handler(async ({ params, request, locals }) => {
	requireAdmin(locals);
	const u = getUser(params.id);
	if (!u) throw new NotFound('No such user');
	const role = (await body(request)).role === 'admin' ? 'admin' : 'member';
	if (u.role === 'admin' && role === 'member' && countAdmins() <= 1) throw new BadRequest('Keep at least one admin');
	updateUser(u.id, { role });
	logActivity('user.role', { actor: locals.user?.email, target: u.email, detail: role });
	return json({ user: getUser(u.id) });
});

export const DELETE: RequestHandler = handler(({ params, locals }) => {
	requireAdmin(locals);
	const u = getUser(params.id);
	if (!u) throw new NotFound('No such user');
	if (u.id === locals.user?.id) throw new BadRequest("You can't remove your own account");
	if (u.role === 'admin' && countAdmins() <= 1) throw new BadRequest('Keep at least one admin');
	deleteUser(u.id);
	logActivity('user.remove', { actor: locals.user?.email, target: u.email });
	return json({ ok: true });
});
