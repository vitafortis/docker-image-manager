import { json } from '@sveltejs/kit';
import { RegistryError } from './registry/distribution.ts';

export class BadRequest extends Error {}
export class NotFound extends Error {}
export class Conflict extends Error {}
export class Forbidden extends Error {}

/** Wraps an API handler so thrown errors become JSON responses with useful messages. */
export function handler<E>(fn: (event: E) => Promise<Response> | Response) {
	return async (event: E) => {
		try {
			return await fn(event);
		} catch (err) {
			if (err instanceof Response) return err;
			if (err instanceof BadRequest) return json({ message: err.message }, { status: 400 });
			if (err instanceof NotFound) return json({ message: err.message }, { status: 404 });
			if (err instanceof Conflict) return json({ message: err.message }, { status: 409 });
			if (err instanceof Forbidden) return json({ message: err.message }, { status: 403 });
			if (err && typeof err === 'object' && 'status' in err && 'location' in err) throw err;
			// The registry's own status says what went wrong, but a 401 from a registry isn't ours:
			// answering 401 would send the browser to the sign-in page.
			if (err instanceof RegistryError) return json({ message: err.message }, { status: err.status === 404 ? 404 : err.status === 400 ? 400 : 502 });
			console.error('[wharf]', err);
			return json({ message: err instanceof Error ? err.message : String(err) }, { status: 500 });
		}
	};
}

/** Changing registries, users and settings is for admins; members search, download and share. */
export function requireAdmin(locals: App.Locals) {
	if (locals.user?.role !== 'admin') throw new Forbidden('Only an admin can change this');
}

/** The request's JSON body as an object, or a 400. */
export async function body(request: Request): Promise<Record<string, unknown>> {
	const b = await request.json().catch(() => null);
	if (!b || typeof b !== 'object' || Array.isArray(b)) throw new BadRequest('Expected a JSON object');
	return b as Record<string, unknown>;
}

export function str(b: Record<string, unknown>, key: string, { required = false, max = 500 } = {}): string | null {
	const v = b[key];
	if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) {
		if (required) throw new BadRequest(`"${key}" is required`);
		return null;
	}
	if (typeof v !== 'string') throw new BadRequest(`"${key}" must be a string`);
	if (v.length > max) throw new BadRequest(`"${key}" is too long`);
	return v.trim();
}

export function int(b: Record<string, unknown>, key: string, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number | null {
	const v = b[key];
	if (v === undefined || v === null || v === '') return null;
	const n = typeof v === 'number' ? v : Number(v);
	if (!Number.isInteger(n) || n < min || n > max) throw new BadRequest(`"${key}" must be a whole number from ${min} to ${max}`);
	return n;
}

/** A list from a JSON array or a comma/newline-separated string. */
export function list(b: Record<string, unknown>, key: string): string[] {
	const v = b[key];
	const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\n,]/) : [];
	return items.map((x) => String(x).trim()).filter(Boolean).slice(0, 1000);
}
