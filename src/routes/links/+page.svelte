<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Ban, Link2, Trash2 } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import KindIcon from '#lib/components/KindIcon.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { ago, dateTime, until } from '#lib/client/format.ts';
	import { confirmAction, toast } from '#lib/client/state.svelte.ts';
	import { imageHref, shortDigest } from '#lib/registries.ts';
	import type { LinkState, ShareLink } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const registries = $derived(Object.fromEntries(data.registries.map((r) => [r.id, r])));
	let show = $state<'active' | 'all'>('active');
	const shown = $derived(show === 'active' ? data.links.filter((l) => l.state === 'active') : data.links);
	const activeCount = $derived(data.links.filter((l) => l.state === 'active').length);

	const STATE: Record<LinkState, { label: string; cls: string }> = {
		active: { label: 'Active', cls: 'badge-success' },
		used: { label: 'Used up', cls: '' },
		expired: { label: 'Expired', cls: '' },
		revoked: { label: 'Revoked', cls: 'badge-danger' }
	};

	/** When the link stops (or stopped) working. */
	function ended(l: ShareLink): string {
		if (l.state === 'revoked') return `revoked ${ago(l.revokedAt)}`;
		if (l.state === 'used') return `used ${ago(l.lastDownloadAt)}`;
		if (l.state === 'expired') return `expired ${ago(l.expiresAt)}`;
		return l.expiresAt ? `expires ${until(l.expiresAt)}` : 'no expiry';
	}

	async function revoke(l: ShareLink) {
		const ok = await confirmAction({ title: 'Revoke this link?', body: 'It stops working at once. Downloads already under way finish.', confirmLabel: 'Revoke', danger: true });
		if (!ok) return;
		try {
			await api.post(`/api/links/${l.id}`);
			toast('success', 'Link revoked');
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't revoke it", errorMessage(err));
		}
	}

	async function remove(l: ShareLink) {
		try {
			await api.del(`/api/links/${l.id}`);
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't delete it", errorMessage(err));
		}
	}
</script>

<svelte:head><title>Share links · Wharf</title></svelte:head>

<div class="h-full overflow-y-auto">
	<PageHeader title="Share links" description="Downloads for people without a sign-in: each link has an expiry, a download limit, or both. Make one from any image.">
		{#snippet actions()}
			<div class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-[0.8125rem]">
				<button class="rounded-md px-3 py-1 {show === 'active' ? 'bg-card font-medium shadow-surface' : 'text-muted-foreground'}" onclick={() => (show = 'active')}>Active · {activeCount}</button>
				<button class="rounded-md px-3 py-1 {show === 'all' ? 'bg-card font-medium shadow-surface' : 'text-muted-foreground'}" onclick={() => (show = 'all')}>All · {data.links.length}</button>
			</div>
		{/snippet}
	</PageHeader>

	<div class="pb-12">
		{#if shown.length}
			<ul class="border-t border-border">
				{#each shown as l (l.id)}
					{@const reg = registries[l.registryId]}
					<li class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 px-4 py-3 sm:px-8">
						<div class="min-w-0 flex-1">
							<a href={imageHref(l.registryId, l.repo, l.ref)} class="flex items-baseline gap-1 text-[0.8125rem] hover:text-primary">
								<span class="truncate font-medium">{l.repo}</span><span class="text-muted-foreground">{l.ref.startsWith('sha256:') ? '@' : ':'}</span><span class="truncate">{l.ref.startsWith('sha256:') ? shortDigest(l.ref) : l.ref}</span>
							</a>
							<p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.6875rem] text-muted-foreground">
								{#if reg}<span class="flex items-center gap-1"><KindIcon kind={reg.kind} class="size-3" />{reg.name}</span>{/if}
								<span>{l.digest ? `pinned to ${shortDigest(l.digest)}` : 'follows the tag'}</span>
								{#if l.platform}<span>{l.platform}</span>{/if}
								<span title={dateTime(l.createdAt)}>made {ago(l.createdAt)}{l.createdBy ? ` by ${l.createdBy}` : ''}</span>
							</p>
							{#if l.note}<p class="mt-1 text-xs">{l.note}</p>{/if}
						</div>
						<div class="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
							<span title="Downloads">{l.downloads}{l.maxDownloads !== null ? ` / ${l.maxDownloads}` : ''} downloads</span>
							<span class="w-28 text-right" title={dateTime(l.expiresAt)}>{ended(l)}</span>
							<span class="badge w-16 justify-center {STATE[l.state].cls}">{STATE[l.state].label}</span>
						</div>
						<div class="flex w-8 justify-end">
							{#if l.state === 'active'}
								<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" title="Revoke" aria-label="Revoke" onclick={() => revoke(l)}><Ban /></button>
							{:else}
								<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" title="Delete from the list" aria-label="Delete" onclick={() => remove(l)}><Trash2 /></button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="px-4 sm:px-8">
				<div class="card">
					<EmptyState icon={Link2} title={show === 'active' ? 'No active links' : 'No links yet'} body="Open an image and choose Share link, or use the link button on any row." />
				</div>
			</div>
		{/if}
	</div>
</div>
