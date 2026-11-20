<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import { Ellipsis, LoaderCircle, Pencil, Plus, RefreshCw, Server, Trash2 } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import KindIcon from '#lib/components/KindIcon.svelte';
	import StatusDot from '#lib/components/StatusDot.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import RegistryDialog from '#lib/components/RegistryDialog.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { ago, dateTime, plural } from '#lib/client/format.ts';
	import { confirmAction, toast } from '#lib/client/state.svelte.ts';
	import { KINDS } from '#lib/registries.ts';
	import type { Registry } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const admin = $derived(!!data.viewer?.admin);

	let dialog = $state(false);
	let editing = $state<Registry | null>(null);
	let syncingHere = $state<Set<string>>(new Set());

	// /registries?add opens the add dialog (from the sidebar and the command palette).
	$effect(() => {
		if (page.url.searchParams.has('add') && admin) {
			editing = null;
			dialog = true;
			goto('/registries', { replace: true, reset: false });
		}
	});

	function edit(r: Registry) {
		editing = r;
		dialog = true;
	}

	async function sync(r: Registry) {
		syncingHere = new Set([...syncingHere, r.id]);
		void invalidateAll();
		try {
			const res = await api.post<{ result: { repos: number; tags: number; errors: string[] } }>(`/api/registries/${r.id}/sync`);
			const { repos, tags, errors } = res.result;
			if (errors.length) toast('error', `Synced ${r.name} with ${plural(errors.length, 'error')}`, errors[0]);
			else toast('success', `Synced ${r.name}`, `${plural(tags, 'tag')} in ${plural(repos, 'repository', 'repositories')}.`);
		} catch (err) {
			toast('error', `Couldn't sync ${r.name}`, errorMessage(err));
		}
		syncingHere.delete(r.id);
		syncingHere = new Set(syncingHere);
		await invalidateAll();
	}

	async function remove(r: Registry) {
		const ok = await confirmAction({
			title: `Remove ${r.name}?`,
			body: 'Wharf forgets this registry, its index and its share links. Nothing in the registry itself is touched.',
			confirmLabel: 'Remove',
			danger: true
		});
		if (!ok) return;
		try {
			await api.del(`/api/registries/${r.id}`);
			toast('success', `Removed ${r.name}`);
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't remove it", errorMessage(err));
		}
	}
</script>

<svelte:head><title>Registries · Wharf</title></svelte:head>

<div class="h-full overflow-y-auto">
	<PageHeader title="Registries" description="Where Wharf finds images. Each one syncs on a schedule, or now with Sync.">
		{#snippet actions()}
			{#if admin}<button class="btn btn-primary" onclick={() => ((editing = null), (dialog = true))}><Plus />Add a registry</button>{/if}
		{/snippet}
	</PageHeader>

	<div class="grid gap-3 px-4 pb-12 sm:px-8 lg:grid-cols-2">
		{#each data.registries as r (r.id)}
			{@const busy = r.syncing || syncingHere.has(r.id)}
			<div class="card flex flex-col">
				<div class="flex items-start gap-3 p-4">
					<span class="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><KindIcon kind={r.kind} class="size-5" /></span>
					<div class="min-w-0 flex-1">
						<a href="/r/{r.id}" class="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight hover:text-primary">
							<span class="truncate">{r.name}</span><StatusDot registry={{ ...r, syncing: busy }} />
						</a>
						<p class="truncate text-xs text-muted-foreground">{KINDS[r.kind].label}{r.host ? ` · ${r.host}` : ''}</p>
					</div>
					{#if admin}
						<Menu
							items={[
								{ label: 'Edit', icon: Pencil, onclick: () => edit(r) },
								'separator',
								{ label: 'Remove', hint: 'Forget it in Wharf; the registry is untouched', icon: Trash2, danger: true, onclick: () => remove(r) }
							]}
						>
							{#snippet trigger({ toggle })}<button class="btn btn-ghost btn-icon btn-sm" aria-label="More" onclick={toggle}><Ellipsis /></button>{/snippet}
						</Menu>
					{/if}
				</div>
				<div class="grid grid-cols-3 gap-px border-y border-border bg-border text-center">
					{#each [[r.repoCount, 'repositories'], [r.tagCount, 'tags']] as [n, l] (l)}
						<div class="bg-card px-3 py-2.5">
							<p class="text-lg font-semibold tabular-nums">{Number(n).toLocaleString()}</p>
							<p class="text-[0.6875rem] text-muted-foreground">{l}</p>
						</div>
					{/each}
					<div class="bg-card px-3 py-2.5" title={dateTime(r.syncedAt)}>
						<p class="text-lg font-semibold">{busy ? '…' : r.syncedAt ? ago(r.syncedAt) : '—'}</p>
						<p class="text-[0.6875rem] text-muted-foreground">last synced</p>
					</div>
				</div>
				{#if r.lastError && !busy}
					<p class="mx-4 mt-3 line-clamp-3 rounded-lg border px-3 py-2 text-xs break-words {r.status === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-warning/30 bg-warning/10 text-warning'}">{r.lastError}</p>
				{/if}
				<div class="mt-auto flex items-center gap-2 p-3">
					<a href="/r/{r.id}" class="btn btn-ghost btn-sm">Browse</a>
					<a href="/?registry={r.id}" class="btn btn-ghost btn-sm">Search</a>
					<button class="btn btn-secondary btn-sm ml-auto" disabled={busy} onclick={() => sync(r)}>
						{#if busy}<LoaderCircle class="animate-spin" />Syncing{:else}<RefreshCw />Sync{/if}
					</button>
				</div>
			</div>
		{:else}
			<div class="card lg:col-span-2">
				<EmptyState icon={Server} title="No registries yet" body={admin ? 'Add your first: a registry on localhost, Amazon ECR, Docker Hub, GitHub Packages, or this Docker host.' : 'An admin adds registries.'}>
					{#snippet action()}{#if admin}<button class="btn btn-primary" onclick={() => (dialog = true)}><Plus />Add a registry</button>{/if}{/snippet}
				</EmptyState>
			</div>
		{/each}
	</div>
</div>

<RegistryDialog bind:open={dialog} registry={editing} onsaved={() => invalidateAll()} />
