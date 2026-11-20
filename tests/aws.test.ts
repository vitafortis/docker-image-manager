import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signV4 } from '../src/lib/server/registry/aws.ts';

// "get-vanilla" from the AWS Signature Version 4 test suite.
test('SigV4 matches the AWS test suite', () => {
	const h = signV4({
		method: 'GET',
		url: 'https://example.amazonaws.com/',
		headers: {},
		body: '',
		region: 'us-east-1',
		service: 'service',
		credentials: { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' },
		date: new Date('2015-08-30T12:36:00Z')
	});
	assert.equal(
		h.authorization,
		'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31'
	);
});

test('SigV4 signs the session token and query', () => {
	const h = signV4({
		method: 'POST',
		url: 'https://api.ecr.us-east-1.amazonaws.com/?b=2&a=1',
		headers: { 'content-type': 'application/x-amz-json-1.1' },
		body: '{}',
		region: 'us-east-1',
		service: 'ecr',
		credentials: { accessKeyId: 'AK', secretAccessKey: 'SK', sessionToken: 'TOKEN' },
		date: new Date('2026-01-01T00:00:00Z')
	});
	assert.equal(h['x-amz-security-token'], 'TOKEN');
	assert.match(h.authorization, /SignedHeaders=content-type;host;x-amz-date;x-amz-security-token,/);
});
