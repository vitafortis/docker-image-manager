import { json } from '@sveltejs/kit';
import { BadRequest, body, handler, int, requireAdmin, str } from '#lib/server/http.ts';
import { getSettings, logActivity, saveSettings } from '#lib/server/store.ts';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = handler(async ({ request, locals }) => {
	requireAdmin(locals);
	const b = await body(request);
	const publicUrl = (str(b, 'publicUrl', { max: 300 }) ?? '').replace(/\/+$/, '');
	if (publicUrl && !/^https?:\/\/[^/\s]+(\/\S*)?$/.test(publicUrl)) throw new BadRequest('The public URL starts with http:// or https://');
	const s = {
		...getSettings(),
		syncMinutes: int(b, 'syncMinutes', { min: 0, max: 7 * 24 * 60 }) ?? 0,
		maxTagsPerRepo: int(b, 'maxTagsPerRepo', { min: 1, max: 100_000 }) ?? 500,
		publicUrl,
		linkHours: int(b, 'linkHours', { min: 0, max: 24 * 365 }) ?? 24,
		linkMaxDownloads: int(b, 'linkMaxDownloads', { min: 0, max: 10_000 }) ?? 1
	};
	saveSettings(s);
	logActivity('settings.update', { actor: locals.user?.email });
	return json({ settings: s });
});
