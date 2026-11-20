<script lang="ts">
	import { goto } from '$app/navigation';
	import { CornerDownLeft, History, Layers, Link2, Moon, Plus, Search, Server, Settings, Tag } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import KindIcon from './KindIcon.svelte';
	import { api } from '#lib/client/api.ts';
	import { session, setTheme, theme } from '#lib/client/state.svelte.ts';
	import { imageHref, shortDigest } from '#lib/registries.ts';
	import type { ImageRow, Registry, RegistryKind } from '#lib/types.ts';

	let { registries }: { registries: Registry[] } = $props();

	type Item = { id: string; label: string; hint?: string; icon?: Component; kind?: RegistryKind; run: () => void };

	let open = $state(false);
	let query = $state('');
	let index = $state(0);
	let input = $state<HTMLInputElement>();
	let dialog: HTMLDialogElement;
	let hits = $state<ImageRow[]>([]);

	const names = $derived(Object.fromEntries(registries.map((r) => [r.id, r])));

	const fixed = $derived.by((): Item[] => [
		...registries.map((r) => ({ id: `r:${r.id}`, label: r.name, hint: r.host || 'Docker host', kind: r.kind, run: () => goto(`/r/${r.id}`) })),
		{ id: 'images', label: 'All images', icon: Layers, run: () => goto('/') },
		{ id: 'registries', label: 'Registries', icon: Server, run: () => goto('/registries') },
		...(session.viewer?.admin ? [{ id: 'add', label: 'Add a registry', icon: Plus, run: () => goto('/registries?add') }] : []),
		{ id: 'links', label: 'Share links', icon: Link2, run: () => goto('/links') },
		{ id: 'activity', label: 'Activity', icon: History, run: () => goto('/activity') },
		{ id: 'settings', label: 'Settings', icon: Settings, run: () => goto('/settings') },
		{ id: 'theme', label: theme.value === 'dark' ? 'Light theme' : 'Dark theme', icon: Moon, run: () => setTheme(theme.value === 'dark' ? 'light' : 'dark') }
	]);

	// Images matching what's typed, from the index, a moment after typing stops.
	$effect(() => {
		const q = query.trim();
		if (!open || q.length < 2) {
			hits = [];
			return;
		}
		const ctrl = new AbortController();
		const t = setTimeout(async () => {
			try {
				hits = (await api.get<{ rows: ImageRow[] }>(`/api/search?limit=8&q=${encodeURIComponent(q)}`, ctrl.signal)).rows;
			} catch {}
		}, 150);
		return () => {
			clearTimeout(t);
			ctrl.abort();
		};
	});

	const filtered = $derived.by((): Item[] => {
		const q = query.trim().toLowerCase();
		if (!q) return fixed;
		const pages = fixed.filter((it) => q.split(/\s+/).every((w) => `${it.label} ${it.hint ?? ''}`.toLowerCase().includes(w)));
		const images = hits.map((h) => ({
			id: `i:${h.registryId}:${h.repo}:${h.tag}`,
			label: `${h.repo}:${h.tag}`,
			hint: `${names[h.registryId]?.name ?? ''} · ${shortDigest(h.digest)}`,
			icon: Tag,
			run: () => goto(imageHref(h.registryId, h.repo, h.tag))
		}));
		return [...images, ...pages, { id: 'search', label: `Search images for “${query.trim()}”`, icon: Search, run: () => goto(`/?q=${encodeURIComponent(query.trim())}`) }];
	});

	$effect(() => {
		void query;
		index = 0;
	});

	$effect(() => {
		if (open && !dialog.open) {
			dialog.showModal();
			query = '';
			queueMicrotask(() => input?.focus());
		} else if (!open && dialog.open) dialog.close();
	});

	function run(it: Item | undefined) {
		if (!it) return;
		open = false;
		it.run();
	}

	function onkeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			open = !open;
		}
	}

	function onInputKey(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			index = Math.min(filtered.length - 1, index + 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			index = Math.max(0, index - 1);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			run(filtered[index]);
		}
	}
</script>

<svelte:window {onkeydown} />

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	onclick={(e) => e.target === dialog && (open = false)}
	class="m-auto mt-[12vh] w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-border bg-card p-0 text-card-foreground shadow-surface-lg backdrop:bg-black/50 backdrop:backdrop-blur-sm"
>
	{#if open}
		<div class="flex items-center gap-2.5 border-b border-border px-4">
			<Search class="size-4 text-muted-foreground" />
			<input bind:this={input} bind:value={query} onkeydown={onInputKey} class="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" placeholder="Find an image, tag or digest, or jump to a page…" />
			<span class="kbd">esc</span>
		</div>
		<ul class="max-h-[50vh] overflow-y-auto p-1.5">
			{#each filtered as it, i (it.id)}
				<li>
					<button
						class="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[0.8125rem] {i === index ? 'bg-accent text-foreground' : 'text-muted-foreground'}"
						onmouseenter={() => (index = i)}
						onclick={() => run(it)}
					>
						{#if it.kind}<KindIcon kind={it.kind} />{:else if it.icon}<it.icon class="size-4 shrink-0" />{/if}
						<span class="truncate font-medium text-foreground">{it.label}</span>
						{#if it.hint}<span class="truncate text-xs">{it.hint}</span>{/if}
						{#if i === index}<CornerDownLeft class="ml-auto size-3.5 shrink-0" />{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</dialog>
