import { listActivity } from '#lib/server/store.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({ activity: listActivity(300) });
