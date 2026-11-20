import type { LayoutServerLoad } from './$types';
import { getSettings, listRegistries } from '#lib/server/store.ts';
import type { Viewer } from '#lib/types.ts';

export const load: LayoutServerLoad = ({ locals }) => {
	const user = locals.user;
	const signedIn = locals.auth === 'authenticated' || locals.auth === 'disabled';
	const viewer: Viewer | null = user && signedIn ? { email: user.email, name: user.name, admin: user.role === 'admin' } : null;
	const s = getSettings();
	return {
		auth: locals.auth,
		version: __APP_VERSION__,
		viewer,
		// Share link pages are public: they get nothing about the rest of Wharf.
		registries: signedIn ? listRegistries() : [],
		linkDefaults: { linkHours: s.linkHours, linkMaxDownloads: s.linkMaxDownloads }
	};
};
