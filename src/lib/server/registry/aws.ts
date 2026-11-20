import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RegistryError } from './distribution.ts';

export type AwsCredentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string; expires?: number };

const hmac = (key: Buffer | string, data: string) => createHmac('sha256', key).update(data, 'utf8').digest();
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const rfc3986 = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * Signs a request with AWS Signature Version 4 and returns the headers to send. Small enough to
 * keep here rather than pull in the AWS SDK for the three ECR calls Berth makes.
 */
export function signV4(req: {
	method: string;
	url: string;
	headers: Record<string, string>;
	body: string;
	region: string;
	service: string;
	credentials: AwsCredentials;
	date?: Date;
}): Record<string, string> {
	const url = new URL(req.url);
	const amzDate = (req.date ?? new Date()).toISOString().replace(/[:-]|\.\d{3}/g, '');
	const day = amzDate.slice(0, 8);
	const headers: Record<string, string> = { ...req.headers, host: url.host, 'x-amz-date': amzDate };
	if (req.credentials.sessionToken) headers['x-amz-security-token'] = req.credentials.sessionToken;
	const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v.trim().replace(/\s+/g, ' ')]));
	const signed = Object.keys(lower).sort();
	const query = [...url.searchParams].map(([k, v]) => `${rfc3986(k)}=${rfc3986(v)}`).sort().join('&');
	const path = url.pathname.split('/').map((s) => rfc3986(decodeURIComponent(s))).join('/') || '/';
	const canonical = [req.method, path, query, signed.map((k) => `${k}:${lower[k]}\n`).join(''), signed.join(';'), hash(req.body)].join('\n');
	const scope = `${day}/${req.region}/${req.service}/aws4_request`;
	const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, hash(canonical)].join('\n');
	const key = hmac(hmac(hmac(hmac(`AWS4${req.credentials.secretAccessKey}`, day), req.region), req.service), 'aws4_request');
	const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
	return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${req.credentials.accessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}` };
}

/* ---------- credentials from the environment ---------- */

let envCache: AwsCredentials | null = null;

/**
 * The credentials the AWS CLI would find in a container: environment variables, a web identity
 * token (EKS IRSA), the ECS task role, or the EC2 instance role (IMDSv2). Cached until near expiry.
 */
export async function environmentCredentials(region: string): Promise<AwsCredentials> {
	if (envCache && (!envCache.expires || envCache.expires - Date.now() > 5 * 60_000)) return envCache;
	const e = process.env;
	if (e.AWS_ACCESS_KEY_ID && e.AWS_SECRET_ACCESS_KEY) {
		return (envCache = { accessKeyId: e.AWS_ACCESS_KEY_ID, secretAccessKey: e.AWS_SECRET_ACCESS_KEY, sessionToken: e.AWS_SESSION_TOKEN });
	}
	if (e.AWS_WEB_IDENTITY_TOKEN_FILE && e.AWS_ROLE_ARN) return (envCache = await webIdentity(e.AWS_WEB_IDENTITY_TOKEN_FILE, e.AWS_ROLE_ARN, region));
	if (e.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || e.AWS_CONTAINER_CREDENTIALS_FULL_URI) {
		const url = e.AWS_CONTAINER_CREDENTIALS_FULL_URI ?? `http://169.254.170.2${e.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI}`;
		const token = e.AWS_CONTAINER_AUTHORIZATION_TOKEN ?? (e.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE ? readFileSync(e.AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE, 'utf8').trim() : undefined);
		const res = await fetch(url, { headers: token ? { authorization: token } : {}, signal: AbortSignal.timeout(3000) });
		if (!res.ok) throw new RegistryError(`The container credentials endpoint answered ${res.status}`);
		return (envCache = fromRoleJson(await res.json()));
	}
	try {
		const tokenRes = await fetch('http://169.254.169.254/latest/api/token', {
			method: 'PUT',
			headers: { 'x-aws-ec2-metadata-token-ttl-seconds': '21600' },
			signal: AbortSignal.timeout(2000)
		});
		const token = await tokenRes.text();
		const h = { 'x-aws-ec2-metadata-token': token };
		const base = 'http://169.254.169.254/latest/meta-data/iam/security-credentials/';
		const role = (await (await fetch(base, { headers: h, signal: AbortSignal.timeout(2000) })).text()).split('\n')[0].trim();
		if (!role) throw new Error('no role');
		return (envCache = fromRoleJson(await (await fetch(base + role, { headers: h, signal: AbortSignal.timeout(2000) })).json()));
	} catch {
		throw new RegistryError(
			'No AWS credentials in the environment: set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY on the container, run it with an instance or task role, or enter access keys instead',
			401
		);
	}
}

function fromRoleJson(j: { AccessKeyId: string; SecretAccessKey: string; Token?: string; Expiration?: string }): AwsCredentials {
	return { accessKeyId: j.AccessKeyId, secretAccessKey: j.SecretAccessKey, sessionToken: j.Token, expires: j.Expiration ? Date.parse(j.Expiration) : undefined };
}

async function webIdentity(file: string, roleArn: string, region: string): Promise<AwsCredentials> {
	const body = new URLSearchParams({
		Action: 'AssumeRoleWithWebIdentity',
		Version: '2011-06-15',
		RoleArn: roleArn,
		RoleSessionName: process.env.AWS_ROLE_SESSION_NAME || 'berth',
		WebIdentityToken: readFileSync(file, 'utf8').trim()
	});
	const res = await fetch(`https://sts.${region}.amazonaws.com/`, { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
	const xml = await res.text();
	if (!res.ok) throw new RegistryError(`STS refused the web identity token: ${tag(xml, 'Message') ?? res.status}`, 401);
	return {
		accessKeyId: tag(xml, 'AccessKeyId') ?? '',
		secretAccessKey: tag(xml, 'SecretAccessKey') ?? '',
		sessionToken: tag(xml, 'SessionToken') ?? undefined,
		expires: Date.parse(tag(xml, 'Expiration') ?? '') || undefined
	};
}

const tag = (xml: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1] ?? null;

/* ---------- ECR ---------- */

export type EcrImage = {
	imageDigest: string;
	imageTags?: string[];
	imageSizeInBytes?: number;
	imagePushedAt?: number;
	imageManifestMediaType?: string;
	artifactMediaType?: string;
};

/** ECR's JSON API: `AmazonEC2ContainerRegistry_V20150921.<Action>`. */
export async function ecr<T>(action: string, payload: object, region: string, credentials: AwsCredentials): Promise<T> {
	const url = `https://api.ecr.${region}.amazonaws.com/`;
	const body = JSON.stringify(payload);
	const headers = signV4({
		method: 'POST',
		url,
		headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AmazonEC2ContainerRegistry_V20150921.${action}` },
		body,
		region,
		service: 'ecr',
		credentials
	});
	let res: Response;
	try {
		res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(30_000) });
	} catch (err) {
		throw new RegistryError(`Can't reach ECR in ${region}: ${(err as Error).message}`);
	}
	const data = (await res.json().catch(() => ({}))) as T & { __type?: string; message?: string; Message?: string };
	if (!res.ok) {
		const kind = data.__type?.split('#').pop() ?? String(res.status);
		const msg = data.message ?? data.Message ?? '';
		throw new RegistryError(`ECR ${action}: ${kind}${msg ? ` (${msg})` : ''}`, res.status === 400 && /Unrecognized|InvalidSignature|AccessDenied|ExpiredToken/.test(kind) ? 401 : res.status);
	}
	return data;
}

/** A registry password from GetAuthorizationToken (good for 12 hours), and the account's registry endpoint. */
export async function ecrLogin(region: string, credentials: AwsCredentials, accountId?: string): Promise<{ username: string; password: string; endpoint: string; expires: number }> {
	const r = await ecr<{ authorizationData: { authorizationToken: string; proxyEndpoint: string; expiresAt: number }[] }>(
		'GetAuthorizationToken',
		accountId ? { registryIds: [accountId] } : {},
		region,
		credentials
	);
	const a = r.authorizationData[0];
	const [username, password] = Buffer.from(a.authorizationToken, 'base64').toString('utf8').split(':');
	return { username, password, endpoint: a.proxyEndpoint, expires: a.expiresAt * 1000 };
}

export async function ecrRepositories(region: string, credentials: AwsCredentials, accountId?: string): Promise<string[]> {
	const out: string[] = [];
	let nextToken: string | undefined;
	do {
		const r = await ecr<{ repositories: { repositoryName: string }[]; nextToken?: string }>(
			'DescribeRepositories',
			{ maxResults: 1000, nextToken, ...(accountId ? { registryId: accountId } : {}) },
			region,
			credentials
		);
		out.push(...r.repositories.map((x) => x.repositoryName));
		nextToken = r.nextToken;
	} while (nextToken);
	return out;
}

export async function ecrImages(repo: string, region: string, credentials: AwsCredentials, accountId?: string, limit = 10_000): Promise<EcrImage[]> {
	const out: EcrImage[] = [];
	let nextToken: string | undefined;
	do {
		const r = await ecr<{ imageDetails: EcrImage[]; nextToken?: string }>(
			'DescribeImages',
			{ repositoryName: repo, maxResults: 1000, nextToken, ...(accountId ? { registryId: accountId } : {}) },
			region,
			credentials
		);
		out.push(...r.imageDetails);
		nextToken = r.nextToken;
	} while (nextToken && out.length < limit);
	return out;
}

export async function ecrDeleteTag(repo: string, tag: string, region: string, credentials: AwsCredentials, accountId?: string) {
	const r = await ecr<{ failures?: { failureReason?: string }[] }>(
		'BatchDeleteImage',
		{ repositoryName: repo, imageIds: [{ imageTag: tag }], ...(accountId ? { registryId: accountId } : {}) },
		region,
		credentials
	);
	if (r.failures?.length) throw new RegistryError(`ECR didn't delete it: ${r.failures[0].failureReason}`);
}
