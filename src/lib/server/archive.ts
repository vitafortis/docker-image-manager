import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pullRef } from '#lib/registries.ts';
import type { Registry } from '#lib/types.ts';
import { imageManifests, isIndex, preferredPlatform, RegistryClient, RegistryError } from './registry/distribution.ts';
import { engineSave } from './registry/engine.ts';
import { sourceFor } from './registry/index.ts';

/* ---------- a streaming tar writer ---------- */

const BLOCK = 512;

/** A ustar header; sizes past ustar's 8 GiB use the GNU base-256 form, which every tar reader accepts. */
export function tarHeader(name: string, size: number, mtime = 0): Buffer {
	const h = Buffer.alloc(BLOCK);
	const nameBytes = Buffer.from(name, 'utf8');
	if (nameBytes.length > 100) throw new Error(`tar name too long: ${name}`);
	nameBytes.copy(h, 0);
	h.write('0000644\0', 100, 'ascii');
	h.write('0000000\0', 108, 'ascii');
	h.write('0000000\0', 116, 'ascii');
	if (size < 0o77777777777) h.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
	else {
		h[124] = 0x80;
		let v = BigInt(size);
		for (let i = 135; i > 124; i--) {
			h[i] = Number(v & 0xffn);
			v >>= 8n;
		}
	}
	h.write(Math.floor(mtime).toString(8).padStart(11, '0') + '\0', 136, 'ascii');
	h.write('        ', 148, 'ascii');
	h.write('0', 156, 'ascii');
	h.write('ustar\0', 257, 'ascii');
	h.write('00', 263, 'ascii');
	let sum = 0;
	for (const b of h) sum += b;
	h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
	return h;
}

const padding = (size: number) => Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK);

export type TarEntry = { name: string; size: number; body: () => Promise<AsyncIterable<Uint8Array> | Buffer>; digest?: string };

/**
 * Writes entries as a tar stream. Bodies are opened one at a time, as the stream reaches them,
 * and a body with a digest is checked as it passes: a blob that doesn't match ends the stream
 * with an error instead of a quietly broken file.
 */
export async function* tarStream(entries: TarEntry[], mtime = Date.now() / 1000): AsyncGenerator<Buffer> {
	for (const e of entries) {
		yield tarHeader(e.name, e.size, mtime);
		const body = await e.body();
		const hash = e.digest ? createHash('sha256') : null;
		let written = 0;
		if (Buffer.isBuffer(body)) {
			hash?.update(body);
			written = body.length;
			yield body;
		} else {
			for await (const chunk of body) {
				const b = Buffer.from(chunk);
				hash?.update(b);
				written += b.length;
				if (written > e.size) throw new RegistryError(`${e.name} is larger than its manifest says`);
				yield b;
			}
		}
		if (written !== e.size) throw new RegistryError(`${e.name} ended after ${written} of ${e.size} bytes`);
		if (hash && `sha256:${hash.digest('hex')}` !== e.digest) throw new RegistryError(`${e.name} didn't match its digest`);
		yield padding(e.size);
	}
	yield Buffer.alloc(BLOCK * 2);
}

/* ---------- images as archives ---------- */

export type Archive = { stream: Readable; filename: string; size: number | null; digest: string };

const fullName = (host: string, repo: string, tag: string) => (host ? `${host}/${repo}:${tag}` : `${repo}:${tag}`);
const blobPath = (digest: string) => `blobs/sha256/${digest.replace(/^sha256:/, '')}`;
const archiveSize = (sizes: number[]) => sizes.reduce((n, s) => n + BLOCK + s + ((BLOCK - (s % BLOCK)) % BLOCK), 0) + BLOCK * 2;

/** `nginx_1.27_linux-arm64.tar` */
function archiveName(repo: string, ref: string, platform: string | null): string {
	const r = ref.startsWith('sha256:') ? ref.slice(7, 19) : ref;
	return `${[repo.split('/').pop(), r, platform?.replace(/\//g, '-')].filter(Boolean).join('_')}.tar`.replace(/[^\w.-]+/g, '_');
}

/**
 * One platform of an image as a tar that both `docker load` and OCI tools read: the OCI image
 * layout (oci-layout, index.json, blobs/sha256/…) plus the manifest.json that `docker save`
 * writes, pointing at the same blobs. Layers stay as the registry stores them (compressed);
 * `docker load` decompresses them itself. Content-Length is exact, so browsers show progress.
 */
export async function imageArchive(registry: Registry, repo: string, ref: string, platform: string | null): Promise<Archive> {
	if (registry.kind === 'docker') {
		const name = ref.startsWith('sha256:') ? ref : `${repo}:${ref}`;
		return { stream: await engineSave(name), filename: archiveName(repo, ref, null), size: null, digest: ref };
	}
	const client = sourceFor(registry).client as RegistryClient;
	let m = await client.manifest(repo, ref);
	let chosenPlatform: string | null = null;
	if (isIndex(m)) {
		const children = imageManifests(m.json);
		const child = preferredPlatform(children, platform);
		if (!child) throw new RegistryError(platform ? `${repo}:${ref} has no ${platform} image` : `${repo}:${ref} has no images`, 404);
		chosenPlatform = child.platform ? [child.platform.os, child.platform.architecture, child.platform.variant].filter(Boolean).join('/') : null;
		m = await client.manifest(repo, child.digest);
	}
	const { config, layers } = m.json;
	if (!config || !layers) throw new RegistryError(`${repo}:${ref} isn't an image Wharf can package (${m.mediaType})`, 400);

	const tag = ref.startsWith('sha256:') ? null : pullRef(registry.host, repo, ref);
	const dockerManifest = Buffer.from(JSON.stringify([{ Config: blobPath(config.digest), RepoTags: tag ? [tag] : [], Layers: layers.map((l) => blobPath(l.digest)) }]));
	const index = Buffer.from(
		JSON.stringify({
			schemaVersion: 2,
			mediaType: 'application/vnd.oci.image.index.v1+json',
			manifests: [
				{
					mediaType: m.mediaType,
					digest: m.digest,
					size: m.raw.length,
					// containerd wants the full name (docker.io/library/alpine:3.24), as `docker save` writes it.
					...(tag ? { annotations: { 'io.containerd.image.name': fullName(registry.host, repo, ref), 'org.opencontainers.image.ref.name': ref } } : {})
				}
			]
		})
	);
	const layout = Buffer.from(JSON.stringify({ imageLayoutVersion: '1.0.0' }));
	const configBody = async () => (await client.blob(repo, config.digest)).body as AsyncIterable<Uint8Array>;

	// A layer listed twice (it happens) is stored once.
	const seen = new Set<string>([m.digest, config.digest]);
	const layerEntries: TarEntry[] = [];
	for (const l of layers) {
		if (seen.has(l.digest)) continue;
		seen.add(l.digest);
		layerEntries.push({ name: blobPath(l.digest), size: l.size, digest: l.digest, body: async () => (await client.blob(repo, l.digest)).body as AsyncIterable<Uint8Array> });
	}
	const entries: TarEntry[] = [
		{ name: 'oci-layout', size: layout.length, body: async () => layout },
		{ name: 'index.json', size: index.length, body: async () => index },
		{ name: 'manifest.json', size: dockerManifest.length, body: async () => dockerManifest },
		{ name: blobPath(m.digest), size: m.raw.length, body: async () => m.raw, digest: m.digest },
		{ name: blobPath(config.digest), size: config.size, body: configBody, digest: config.digest },
		...layerEntries
	];
	return {
		stream: Readable.from(tarStream(entries)),
		filename: archiveName(repo, ref, chosenPlatform),
		size: archiveSize(entries.map((e) => e.size)),
		digest: m.digest
	};
}

/** The response for an archive: a download with its name, and its length when known. */
export function archiveResponse(a: Archive, onDone?: (ok: boolean) => void): Response {
	let finished = false;
	const finish = (ok: boolean) => {
		if (finished) return;
		finished = true;
		onDone?.(ok);
	};
	a.stream.on('end', () => finish(true));
	a.stream.on('error', (err) => {
		console.warn('[wharf] download failed:', err.message);
		finish(false);
	});
	a.stream.on('close', () => finish(a.stream.readableEnded));
	const headers: Record<string, string> = {
		'content-type': 'application/x-tar',
		'content-disposition': `attachment; filename="${a.filename}"`,
		'cache-control': 'no-store',
		'x-image-digest': a.digest
	};
	if (a.size !== null) headers['content-length'] = String(a.size);
	return new Response(Readable.toWeb(a.stream) as ReadableStream, { headers });
}
