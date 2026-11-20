<script lang="ts">
	import { untrack } from 'svelte';
	import { Link2, LoaderCircle } from '@lucide/svelte';
	import Dialog from './Dialog.svelte';
	import Switch from './Switch.svelte';
	import CopyField from './CopyField.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { sharing, toast } from '#lib/client/state.svelte.ts';
	import type { Settings, ShareLink } from '#lib/types.ts';

	/** Makes a share link for the image in `sharing.target`. The URL is shown once. */
	let { defaults }: { defaults: Pick<Settings, 'linkHours' | 'linkMaxDownloads'> } = $props();

	const EXPIRY = [
		{ hours: 1, label: '1 hour' },
		{ hours: 24, label: '1 day' },
		{ hours: 24 * 7, label: '7 days' },
		{ hours: 24 * 30, label: '30 days' },
		{ hours: 0, label: 'Never' }
	];
	const DOWNLOADS = [
		{ n: 1, label: 'Once' },
		{ n: 3, label: '3 times' },
		{ n: 10, label: '10 times' },
		{ n: 0, label: 'No limit' }
	];

	const target = $derived(sharing.target);
	let hours = $state(untrack(() => defaults.linkHours));
	let maxDownloads = $state(untrack(() => defaults.linkMaxDownloads));
	let follow = $state(false);
	let platform = $state('');
	let note = $state('');
	let busy = $state(false);
	let result = $state<{ link: ShareLink; url: string } | null>(null);

	// A fresh form each time the dialog opens for an image.
	$effect(() => {
		if (!target) return;
		untrack(() => {
			hours = defaults.linkHours;
			maxDownloads = defaults.linkMaxDownloads;
			follow = false;
			platform = '';
			note = '';
			result = null;
		});
	});

	const isDigest = $derived(target?.ref.startsWith('sha256:') ?? false);
	const multi = $derived((target?.platforms.length ?? 0) > 1);
	const invalid = $derived(!hours && !maxDownloads);
	const curl = $derived(result ? `curl -fL -o image.tar '${result.url}/download' && docker load -i image.tar` : '');

	async function create(e: SubmitEvent) {
		e.preventDefault();
		if (!target) return;
		busy = true;
		try {
			result = await api.post('/api/links', { ...target, hours, maxDownloads, follow, platform: multi ? platform || null : null, note });
		} catch (err) {
			toast('error', "Couldn't make the link", errorMessage(err));
		}
		busy = false;
	}
</script>

<Dialog
	bind:open={() => !!target, (v) => !v && (sharing.target = null)}
	title={result ? 'Link ready' : 'Share a download link'}
	description={target ? `${target.repo}${isDigest ? '@' : ':'}${target.ref}` : ''}
>
	{#if result}
		<div class="space-y-4">
			<p class="text-[0.8125rem] text-muted-foreground">
				Anyone with this link can download the image without signing in{result.link.maxDownloads === 1 ? ', once' : ''}. Copy it now: Wharf keeps only a hash of it, so it can't be shown again.
			</p>
			<CopyField value={result.url} />
			<div>
				<p class="label">From a terminal</p>
				<CopyField value={curl} />
			</div>
		</div>
	{:else}
		<form id="share-form" class="space-y-4" onsubmit={create}>
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="share-exp">Expires after</label>
					<select id="share-exp" class="input" bind:value={hours}>
						{#each EXPIRY as e (e.hours)}<option value={e.hours}>{e.label}</option>{/each}
						{#if !EXPIRY.some((e) => e.hours === hours)}<option value={hours}>{hours} hours</option>{/if}
					</select>
				</div>
				<div>
					<label class="label" for="share-max">Can be downloaded</label>
					<select id="share-max" class="input" bind:value={maxDownloads}>
						{#each DOWNLOADS as d (d.n)}<option value={d.n}>{d.label}</option>{/each}
						{#if !DOWNLOADS.some((d) => d.n === maxDownloads)}<option value={maxDownloads}>{maxDownloads} times</option>{/if}
					</select>
				</div>
			</div>
			{#if invalid}<p class="text-xs text-danger">A link that never expires needs a download limit.</p>{/if}
			{#if multi}
				<div>
					<label class="label" for="share-platform">Platform</label>
					<select id="share-platform" class="input" bind:value={platform}>
						<option value="">linux/amd64, or the first there is</option>
						{#each target?.platforms ?? [] as p (p)}<option value={p}>{p}</option>{/each}
					</select>
				</div>
			{/if}
			{#if !isDigest}
				<div class="flex items-start justify-between gap-4 rounded-lg border border-border bg-surface px-3 py-2.5">
					<div>
						<p class="text-[0.8125rem] font-medium">Follow the tag</p>
						<p class="text-xs text-muted-foreground">Off: the link always downloads today's image. On: whatever <span class="hash">{target?.ref}</span> points at when it's used.</p>
					</div>
					<Switch bind:checked={follow} label="Follow the tag" />
				</div>
			{/if}
			<div>
				<label class="label" for="share-note">Note <span class="font-normal">(optional, for the links list and the download page)</span></label>
				<input id="share-note" class="input" maxlength="200" placeholder="For the Acme on-prem install" bind:value={note} />
			</div>
		</form>
	{/if}
	{#snippet footer()}
		{#if result}
			<a class="btn btn-ghost" href="/links" onclick={() => (sharing.target = null)}>All links</a>
			<button class="btn btn-primary" onclick={() => (sharing.target = null)}>Done</button>
		{:else}
			<button class="btn btn-ghost" onclick={() => (sharing.target = null)}>Cancel</button>
			<button class="btn btn-primary" form="share-form" disabled={busy || invalid}>
				{#if busy}<LoaderCircle class="animate-spin" />{:else}<Link2 />{/if}Make link
			</button>
		{/if}
	{/snippet}
</Dialog>
