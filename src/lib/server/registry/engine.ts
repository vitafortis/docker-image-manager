import { request as httpRequest, type IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { config } from '../config.ts';
import { RegistryError } from './distribution.ts';

/**
 * The Docker Engine API over its socket (or tcp://host:2375). Only reads images, exports them
 * (`docker save`) and removes tags; nothing here runs containers.
 */
function target(): { socketPath?: string; host?: string; port?: number } {
	const h = config.dockerHost;
	if (h.startsWith('unix://')) return { socketPath: h.slice('unix://'.length) };
	const u = new URL(h.replace(/^tcp:/, 'http:'));
	return { host: u.hostname, port: Number(u.port || 2375) };
}

export function engineRaw(method: string, path: string, timeout = 30_000): Promise<IncomingMessage> {
	return new Promise((resolve, reject) => {
		const req = httpRequest({ ...target(), method, path: `/v1.43${path}`, headers: { host: 'docker' }, timeout }, resolve);
		req.on('timeout', () => req.destroy(new Error('timed out')));
		req.on('error', (err: NodeJS.ErrnoException) =>
			reject(
				new RegistryError(
					err.code === 'ENOENT' || err.code === 'ECONNREFUSED'
						? `No Docker Engine at ${config.dockerHost}: mount /var/run/docker.sock into Wharf's container`
						: err.code === 'EACCES'
							? `Wharf can't open ${config.dockerHost}: permission denied`
							: `Docker Engine: ${err.message}`
				)
			)
		);
		req.end();
	});
}

export async function engine<T>(method: string, path: string): Promise<T> {
	const res = await engineRaw(method, path);
	const chunks: Buffer[] = [];
	for await (const c of res) chunks.push(c as Buffer);
	const text = Buffer.concat(chunks).toString('utf8');
	if ((res.statusCode ?? 500) >= 400) {
		let msg = text;
		try {
			msg = (JSON.parse(text) as { message: string }).message;
		} catch {}
		throw new RegistryError(`Docker Engine: ${msg || res.statusCode}`, res.statusCode === 404 ? 404 : 502);
	}
	return (text ? JSON.parse(text) : null) as T;
}

export type EngineImage = {
	Id: string;
	RepoTags: string[] | null;
	RepoDigests: string[] | null;
	Created: number;
	Size: number;
	Labels: Record<string, string> | null;
};

export type EngineInspect = {
	Id: string;
	RepoTags: string[];
	RepoDigests: string[];
	Created: string;
	Size: number;
	Architecture: string;
	Os: string;
	Variant?: string;
	Config: {
		Env?: string[];
		Entrypoint?: string[] | null;
		Cmd?: string[] | null;
		WorkingDir?: string;
		User?: string;
		ExposedPorts?: Record<string, object>;
		Labels?: Record<string, string> | null;
	};
	RootFS: { Layers?: string[] };
};

export type EngineHistory = { Id: string; Created: number; CreatedBy: string; Size: number; Comment: string }[];

export const engineImages = () => engine<EngineImage[]>('GET', '/images/json');
export const engineInspect = (ref: string) => engine<EngineInspect>('GET', `/images/${encodeURIComponent(ref)}/json`);
export const engineHistory = (ref: string) => engine<EngineHistory>('GET', `/images/${encodeURIComponent(ref)}/history`);
export const engineRemove = (ref: string) => engine<unknown>('DELETE', `/images/${encodeURIComponent(ref)}?noprune=false`);

/** `docker save` of one reference, as a stream. */
export async function engineSave(ref: string): Promise<Readable> {
	const res = await engineRaw('GET', `/images/get?names=${encodeURIComponent(ref)}`, 0);
	if ((res.statusCode ?? 500) >= 400) {
		res.resume();
		throw new RegistryError(`Docker Engine couldn't export ${ref} (${res.statusCode})`);
	}
	return res;
}

export async function enginePing(): Promise<void> {
	const res = await engineRaw('GET', '/_ping', 5000);
	res.resume();
	if (res.statusCode !== 200) throw new RegistryError(`Docker Engine answered ${res.statusCode}`);
}

/** `ghcr.io/a/b:1` → repo `ghcr.io/a/b`, tag `1`. Untagged images go under `<none>` by short ID. */
export function splitEngineTag(repoTag: string): { repo: string; tag: string } {
	const colon = repoTag.lastIndexOf(':');
	if (colon > repoTag.lastIndexOf('/')) return { repo: repoTag.slice(0, colon), tag: repoTag.slice(colon + 1) };
	return { repo: repoTag, tag: 'latest' };
}
