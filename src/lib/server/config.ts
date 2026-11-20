import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** True when this process itself runs inside a container. */
export const IN_CONTAINER = existsSync('/.dockerenv') || existsSync('/run/.containerenv');

const env = (name: string): string | undefined => process.env[`BERTH_${name}`];

const dataDir = resolve(env('DATA_DIR') ?? './data');

/** The local Docker Engine, for the "This Docker host" registry kind. */
function defaultDockerHost(): string {
	const host = env('DOCKER_HOST') ?? process.env.DOCKER_HOST;
	if (host) return host;
	const candidates = [
		'/var/run/docker.sock',
		`${process.env.HOME}/.docker/run/docker.sock`,
		`${process.env.HOME}/.orbstack/run/docker.sock`,
		`${process.env.HOME}/.colima/default/docker.sock`
	];
	return `unix://${candidates.find((p) => existsSync(p)) ?? candidates[0]}`;
}

const adminEmail = env('ADMIN_EMAIL');
const adminPassword = env('ADMIN_PASSWORD');

export const config = {
	dataDir,
	/** Optional master secret. When unset, a random key is generated in the data dir. */
	secretKey: env('SECRET_KEY'),
	/** Creates the first account on start (skips the setup wizard). */
	bootstrapAdmin:
		adminEmail && adminPassword
			? { email: adminEmail.trim(), password: adminPassword, name: env('ADMIN_NAME')?.trim() || null }
			: undefined,
	/** `disabled` turns off the login screen — only for fully trusted networks. */
	authDisabled: env('AUTH') === 'disabled',
	/** `unix:///var/run/docker.sock` or `tcp://host:2375`. */
	dockerHost: defaultDockerHost()
};
