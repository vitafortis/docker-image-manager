import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextLink, parseChallenge, imageManifests } from '../src/lib/server/registry/distribution.ts';

test('WWW-Authenticate challenges', () => {
	assert.deepEqual(parseChallenge('Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"'), {
		scheme: 'bearer',
		params: { realm: 'https://auth.docker.io/token', service: 'registry.docker.io', scope: 'repository:library/nginx:pull' }
	});
	assert.deepEqual(parseChallenge('Basic realm="Registry Realm"'), { scheme: 'basic', params: { realm: 'Registry Realm' } });
	assert.equal(parseChallenge(null), null);
});

test('Link pagination', () => {
	assert.equal(nextLink('</v2/_catalog?last=b&n=2>; rel="next"', 'http://r:5000'), 'http://r:5000/v2/_catalog?last=b&n=2');
	assert.equal(nextLink(null, 'http://r'), null);
});

test('attestations are not platforms', () => {
	const d = (arch: string, extra = {}) => ({ mediaType: 'm', digest: `sha256:${arch}`, size: 1, platform: { os: arch === 'unknown' ? 'unknown' : 'linux', architecture: arch }, ...extra });
	assert.deepEqual(
		imageManifests({ manifests: [d('amd64'), d('unknown'), d('arm64', { annotations: { 'vnd.docker.reference.type': 'attestation-manifest' } })] }).map((x) => x.platform?.architecture),
		['amd64']
	);
});
