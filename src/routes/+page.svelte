<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { CircleHelp, Layers, LoaderCircle, Plus, Search, SearchX, X } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import ImageTable from '#lib/components/ImageTable.svelte';
	import KindIcon from '#lib/components/KindIcon.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { plural } from '#lib/client/format.ts';
	import { toast } from '#lib/client/state.svelte.ts';
	import type { ImageRow } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let q = $state(untrack(() => data.q));
	let rows = $state<ImageRow[]>([]);
	let more = $state(false);
	let help = $state(false);
	let input = $state<HTMLInputElement>();

	// The URL is the source of truth: back/forward and shared links restore the search.
	$effect(() => {
		rows = data.rows;
		untrack(() => {
			if (document.activeElement !== input) q = data.q;
		});
	});

	const registries = $derived(Object.fromEntries(data.registries.map((r) => [r.id, r])));

	function navigate(next: { q?: string; registry?: string }) {
		const p = new URLSearchParams();
		const nq = next.q ?? q;
		const nr = next.registry ?? data.registry;
		if (nq.trim()) p.set('q', nq.trim());
		if (nr) p.set('registry', nr);
		goto(`/${p.size ? `?${p}` : ''}`, { replace: true, reset: false });
	}

	// Search as you type, a moment after typing stops.
	$effect(() => {
		const value = q;
		if (value.trim() === untrack(() => data.q)) return;
		const t = setTimeout(() => navigate({ q: value }), 200);
		return () => clearTimeout(t);
	});

	async function loadMore() {
		more = true;
		try {
			const p = new URLSearchParams({ q: data.q, offset: String(rows.length), limit: '100' });
			if (data.registry) p.set('registry', data.registry);
			const r = await api.get<{ rows: ImageRow[] }>(`/api/search?${p}`);
			rows = [...rows, ...r.rows];
		} catch (err) {
			toast('error', "Couldn't load more", errorMessage(err));
		}
		more = false;
	}

	function onkeydown(e: KeyboardEvent) {
		// "/" focuses the search, as on GitHub.
		if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
			e.preventDefault();
			input?.focus();
		}
	}

	const EXAMPLES = [
		['nginx 1.27', 'repository or tag contains both words'],
		['api:v2.*', 'a reference: repository api, tags from v2.'],
		['sha256:3f2a9c', 'a digest or image ID, by its first characters'],
		['tag:*-rc*', 'tags matching a glob'],
		['repo:team/ registry:ecr', 'narrow to a repository and a registry'],
		['arch:arm64', 'images with an arm64 platform'],
		['label:org.opencontainers.image.source=*acme*', 'by image label'],
		['-tag:latest', 'leave out a match']
	];
</script>

<svelte:head><title>Images · Berth</title></svelte:head>
<svelte:window {onkeydown} />

<div class="h-full overflow-y-auto">
	<PageHeader title="Images" description={data.totals.tags ? `${plural(data.totals.tags, 'tag')} in ${plural(data.totals.repos, 'repository', 'repositories')} across ${plural(data.totals.registries, 'registry', 'registries')}.` : 'Every tag in every registry, searchable in one place.'} />

	{#if data.registries.length === 0}
		<div class="px-4 sm:px-8">
			<div class="card">
				<EmptyState icon={Layers} title="No registries yet" body="Add a registry (a local registry:2, Amazon ECR, Docker Hub, GitHub Packages, Harbor, or this Docker host) and Berth indexes its images.">
					{#snippet action()}<a href="/registries?add" class="btn btn-primary"><Plus />Add a registry</a>{/snippet}
				</EmptyState>
			</div>
		</div>
	{:else}
		<div class="space-y-3 px-4 sm:px-8">
			<div class="relative">
				<Search class="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
				<input
					bind:this={input}
					bind:value={q}
					class="input h-11 pr-20 pl-10 text-[0.9375rem]"
					placeholder="Search by repository, tag, digest or label…"
					spellcheck="false"
					autocomplete="off"
					aria-label="Search images"
				/>
				<div class="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
					{#if q}<button class="btn btn-ghost btn-icon btn-sm" aria-label="Clear" onclick={() => ((q = ''), navigate({ q: '' }))}><X /></button>{/if}
					<button class="btn btn-ghost btn-icon btn-sm" aria-label="Search syntax" title="Search syntax" aria-pressed={help} onclick={() => (help = !help)}><CircleHelp /></button>
				</div>
			</div>

			{#if help}
				<div class="card grid gap-x-6 gap-y-1.5 p-4 text-xs sm:grid-cols-2">
					{#each EXAMPLES as [ex, what] (ex)}
						<button class="flex items-baseline gap-2 text-left" onclick={() => ((q = ex), navigate({ q: ex }))}>
							<code class="hash shrink-0 rounded bg-muted px-1.5 py-0.5 text-foreground">{ex}</code>
							<span class="text-muted-foreground">{what}</span>
						</button>
					{/each}
				</div>
			{/if}

			<div class="flex flex-wrap items-center gap-1.5">
				<button class="badge h-6 px-2 {data.registry ? 'hover:text-foreground' : 'badge-primary'}" onclick={() => navigate({ registry: '' })}>All registries</button>
				{#each data.registries as r (r.id)}
					<button class="badge h-6 px-2 {data.registry === r.id ? 'badge-primary' : 'hover:text-foreground'}" onclick={() => navigate({ registry: data.registry === r.id ? '' : r.id })}>
						<KindIcon kind={r.kind} />{r.name}
					</button>
				{/each}
				<span class="ml-auto text-xs text-muted-foreground tabular-nums">{plural(data.total, 'match', 'matches')}</span>
			</div>
		</div>

		<div class="mt-4 pb-12">
			{#if rows.length}
				<ImageTable {rows} {registries} />
				{#if rows.length < data.total}
					<div class="flex justify-center pt-4">
						<button class="btn btn-secondary" disabled={more} onclick={loadMore}>
							{#if more}<LoaderCircle class="animate-spin" />{/if}Show more ({(data.total - rows.length).toLocaleString()} left)
						</button>
					</div>
				{/if}
			{:else if data.totals.tags === 0}
				<EmptyState icon={LoaderCircle} title="Nothing indexed yet" body="Registries sync in the background; their tags show up here as they come in." />
			{:else}
				<EmptyState icon={SearchX} title="No images match" body="Try fewer words, a shorter digest, or a glob like tag:v1.*" />
			{/if}
		</div>
	{/if}
</div>
