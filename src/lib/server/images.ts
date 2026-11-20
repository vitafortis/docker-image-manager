import { platformString, pullRef } from '#lib/registries.ts';
import type { ImageDetail, Registry } from '#lib/types.ts';
import { engineHistory, engineInspect, engineRemove } from './registry/engine.ts';
import { RegistryError, sourceFor } from './registry/index.ts';
import { deleteIndexedTag, findImage, logActivity, tagsForDigest } from './store.ts';

/** Everything the image page shows, read live from the registry (the index only has a summary). */
export async function imageDetail(r: Registry, repo: string, ref: string): Promise<ImageDetail> {
	if (r.kind === 'docker') return engineDetail(r, repo, ref);
	const client = sourceFor(r).client!;
	const d = await client.inspect(repo, ref);
	return {
		registryId: r.id,
		repo,
		ref,
		digest: d.digest,
		mediaType: d.mediaType,
		manifest: d.manifest,
		platforms: d.platforms,
		aliases: tagsForDigest(r.id, repo, d.digest).filter((t) => t !== ref),
		pullRef: pullRef(r.host, repo, ref)
	};
}

async function engineDetail(r: Registry, repo: string, ref: string): Promise<ImageDetail> {
	const name = ref.startsWith('sha256:') || repo === '<none>' ? (findImage(r.id, repo, ref)?.digest ?? ref) : `${repo}:${ref}`;
	const [i, history] = await Promise.all([engineInspect(name), engineHistory(name)]);
	const c = i.Config ?? {};
	return {
		registryId: r.id,
		repo,
		ref,
		digest: i.Id,
		mediaType: 'docker-engine',
		manifest: JSON.stringify(i, null, 2),
		platforms: [
			{
				platform: platformString({ os: i.Os, architecture: i.Architecture, variant: i.Variant }),
				digest: i.Id,
				configDigest: i.Id,
				size: i.Size,
				// The engine keeps layers uncompressed, by their diff IDs; there are no sizes per layer.
				layers: (i.RootFS?.Layers ?? []).map((digest) => ({ mediaType: 'application/vnd.docker.image.rootfs.diff.tar', digest, size: 0 })),
				created: i.Created,
				env: c.Env ?? [],
				entrypoint: c.Entrypoint ?? null,
				cmd: c.Cmd ?? null,
				workdir: c.WorkingDir || null,
				user: c.User || null,
				exposedPorts: Object.keys(c.ExposedPorts ?? {}),
				labels: c.Labels ?? {},
				history: [...history].reverse().map((h) => ({
					created: h.Created ? new Date(h.Created * 1000).toISOString() : null,
					createdBy: h.CreatedBy,
					emptyLayer: h.Size === 0,
					comment: h.Comment || null
				}))
			}
		],
		aliases: [...(i.RepoTags ?? [])].filter((t) => t !== `${repo}:${ref}`),
		pullRef: repo === '<none>' ? i.Id : `${repo}:${ref}`
	};
}

/** Deletes a tag from the registry. On plain registries that deletes the manifest, and with it every tag on the same digest. */
export async function deleteTag(r: Registry, repo: string, tag: string, actor: string | null): Promise<{ removed: string[] }> {
	const img = findImage(r.id, repo, tag);
	if (r.kind === 'docker') {
		await engineRemove(repo === '<none>' ? (img?.digest ?? tag) : `${repo}:${tag}`);
		deleteIndexedTag(r.id, repo, tag);
		logActivity('image.delete', { actor, target: `${r.name}: ${repo}:${tag}` });
		return { removed: [tag] };
	}
	const source = sourceFor(r);
	const digest = img?.digest ?? (await source.client!.resolve(repo, tag)).digest;
	await source.deleteTag(repo, tag, digest);
	// ECR removes just the tag; the registry API removes the manifest and so all its tags.
	const removed = r.kind === 'ecr' ? [tag] : tagsForDigest(r.id, repo, digest);
	for (const t of removed.length ? removed : [tag]) deleteIndexedTag(r.id, repo, t);
	logActivity('image.delete', { actor, target: `${r.name}: ${repo}:${tag}`, detail: removed.length > 1 ? `also removed ${removed.filter((t) => t !== tag).join(', ')}` : null });
	return { removed };
}

export { RegistryError };
