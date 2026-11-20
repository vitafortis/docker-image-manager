import { json } from '@sveltejs/kit';
import { hashPassword } from '#lib/server/crypto.ts';
import { BadRequest, body, handler, requireAdmin, str } from '#lib/server/http.ts';
import { createUser, findUserByEmail, logActivity } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds a person. Members search, download and share; admins also manage registries, users and settings. */
export const POST: RequestHandler = handler(async ({ request, locals }) => {
	requireAdmin(locals);
	const b = await body(request);
	const email = str(b, 'email', { required: true, max: 200 })!;
	if (!EMAIL.test(email)) throw new BadRequest('Enter a valid email address');
	if (findUserByEmail(email)) throw new BadRequest(`${email} already has an account`);
	const password = typeof b.password === 'string' ? b.password : '';
	if (password.length < 8) throw new BadRequest('Use at least 8 characters for the password');
	const user = createUser({ email, name: str(b, 'name', { max: 100 }), passwordHash: hashPassword(password), role: b.role === 'admin' ? 'admin' : 'member' });
	logActivity('user.add', { actor: locals.user?.email, target: email, detail: user.role });
	return json({ user });
});
