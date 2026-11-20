import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import { tarHeader } from '../src/lib/server/archive.ts';

/**
 * A registry with token auth (Basic at the token server, Bearer at the registry), a paginated
 * catalog, and two repositories: `team/api` (a multi-platform index with an attestation) and
 * `team/web` (one image).
 */
export type Mock = { url: string; server: Server; digests: Record<string, string>; blobs: Map<string, Buffer>; requests: string[]; close: () => Promise<void> };

const sha = (b: Buffer) => `sha256:${createHash('sha256').update(b).digest('hex')}`;

function layer(name: string, content: string): Buffer {
	const body = Buffer.from(content);
	return gzipSync(Buffer.concat([tarHeader(name, body.length), body, Buffer.alloc((512 - (body.length % 512)) % 512), Buffer.alloc(1024)]));
}

export async function startMock(): Promise<Mock> {
	const blobs = new Map<string, Buffer>();
	const manifests = new Map<string, { body: Buffer; type: string }>();
	const tags = new Map<string, Record<string, string>>();
	const put = (b: Buffer) => (blobs.set(sha(b), b), sha(b));
	const putManifest = (obj: object, type: string) => {
		const body = Buffer.from(JSON.stringify(obj));
		manifests.set(sha(body), { body, type });
		return { digest: sha(body), size: body.length, mediaType: type };
	};
	const image = (arch: string, label: string) => {
		const cfg = Buffer.from(
			JSON.stringify({
				architecture: arch,
				os: 'linux',
				created: '2026-11-01T10:00:00Z',
				config: { Env: ['PATH=/usr/bin'], Cmd: ['/app'], Labels: { 'org.opencontainers.image.source': `https://github.com/acme/${label}` } },
				history: [{ created: '2026-11-01T10:00:00Z', created_by: 'COPY app /app' }]
			})
		);
		const l = layer('app', `binary for ${arch} (${label})`);
		return putManifest(
			{
				schemaVersion: 2,
				mediaType: 'application/vnd.oci.image.manifest.v1+json',
				config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: put(cfg), size: cfg.length },
				layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip', digest: put(l), size: l.length }]
			},
			'application/vnd.oci.image.manifest.v1+json'
		);
	};
	const amd = image('amd64', 'api');
	const arm = image('arm64', 'api');
	const index = putManifest(
		{
			schemaVersion: 2,
			mediaType: 'application/vnd.oci.image.index.v1+json',
			manifests: [
				{ ...amd, platform: { os: 'linux', architecture: 'amd64' } },
				{ ...arm, platform: { os: 'linux', architecture: 'arm64' } },
				{ ...amd, digest: amd.digest, platform: { os: 'unknown', architecture: 'unknown' }, annotations: { 'vnd.docker.reference.type': 'attestation-manifest' } }
			]
		},
		'application/vnd.oci.image.index.v1+json'
	);
	const web = image('amd64', 'web');
	tags.set('team/api', { 'v1.2.0': index.digest, latest: index.digest, 'v1.10.0-rc1': amd.digest });
	tags.set('team/web', { '2026.11': web.digest });

	const requests: string[] = [];
	const server = createServer((req, res) => {
		const url = new URL(req.url!, 'http://x');
		requests.push(`${req.method} ${url.pathname}`);
		const json = (code: number, body: unknown, headers: Record<string, string> = {}) => {
			res.writeHead(code, { 'content-type': 'application/json', ...headers });
			res.end(JSON.stringify(body));
		};
		if (url.pathname === '/token') {
			if (req.headers.authorization !== `Basic ${Buffer.from('bot:hunter22').toString('base64')}`) return json(401, {});
			return json(200, { token: 'tok-123', expires_in: 300 });
		}
		if (req.headers.authorization !== 'Bearer tok-123') {
			const realm = `http://${req.headers.host}/token`;
			return json(401, { errors: [{ code: 'UNAUTHORIZED' }] }, { 'www-authenticate': `Bearer realm="${realm}",service="mock",scope="repository:x:pull"` });
		}
		if (url.pathname === '/v2/') return json(200, {});
		if (url.pathname === '/v2/_catalog') {
			// Two pages, to exercise the Link header.
			if (!url.searchParams.get('last')) return json(200, { repositories: ['team/api'] }, { link: '</v2/_catalog?last=team%2Fapi&n=1000>; rel="next"' });
			return json(200, { repositories: ['team/web'] });
		}
		const m = /^\/v2\/(.+)\/(tags\/list|manifests|blobs)\/?(.*)$/.exec(url.pathname);
		if (!m) return json(404, {});
		const [, repo, what, ref] = m;
		if (what === 'tags/list') return json(200, { name: repo, tags: Object.keys(tags.get(repo) ?? {}) });
		if (what === 'manifests') {
			const digest = ref.startsWith('sha256:') ? ref : tags.get(repo)?.[ref];
			const man = digest && manifests.get(digest);
			if (!man) return json(404, { errors: [{ code: 'MANIFEST_UNKNOWN' }] });
			if (req.method === 'DELETE') {
				for (const [t, d] of Object.entries(tags.get(repo) ?? {})) if (d === digest) delete tags.get(repo)![t];
				res.writeHead(202).end();
				return;
			}
			res.writeHead(200, { 'content-type': man.type, 'docker-content-digest': digest, 'content-length': man.body.length });
			return res.end(req.method === 'HEAD' ? undefined : man.body);
		}
		const blob = blobs.get(ref);
		if (!blob) return json(404, { errors: [{ code: 'BLOB_UNKNOWN' }] });
		res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': blob.length });
		res.end(blob);
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
	const port = (server.address() as { port: number }).port;
	return {
		url: `http://127.0.0.1:${port}`,
		server,
		digests: { index: index.digest, amd: amd.digest, arm: arm.digest, web: web.digest },
		blobs,
		requests,
		close: () => new Promise((r) => server.close(() => r()))
	};
}
