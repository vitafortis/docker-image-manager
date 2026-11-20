import { listLinks } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ links: listLinks() });
