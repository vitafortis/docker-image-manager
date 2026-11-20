import { config } from '#lib/server/config.ts';
import { getSettings, listUsers } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const admin = locals.user?.role === 'admin';
	return {
		settings: getSettings(),
		users: admin ? listUsers() : [],
		me: locals.user && locals.user.id !== 'open' ? { id: locals.user.id, name: locals.user.name, email: locals.user.email } : null,
		dockerHost: config.dockerHost,
		origin: locals.origin
	};
};
