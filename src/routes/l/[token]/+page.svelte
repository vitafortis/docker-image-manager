<script lang="ts">
	import { page } from '$app/state';
	import { Download, Link2Off } from '@lucide/svelte';
	import Logo from '#lib/components/Logo.svelte';
	import CopyField from '#lib/components/CopyField.svelte';
	import { bytes, dateTime, plural, until } from '#lib/client/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let started = $state(false);
	const url = $derived(`${page.url.origin}${page.url.pathname}/download`);
	const curl = $derived(`curl -fL -o ${data.filename} '${url}' && docker load -i ${data.filename}`);
	const active = $derived(data.state === 'active' && !(started && data.remaining === 1));
</script>

<svelte:head>
	<title>{data.image} · Berth</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
	<div class="dot-grid mask-fade pointer-events-none absolute inset-0 opacity-70"></div>
	<div class="glow-top pointer-events-none absolute inset-x-0 top-0 h-[480px]"></div>

	<div class="card relative w-full max-w-lg min-w-0 p-7 shadow-surface-lg max-sm:p-5">
		<div class="mb-6 flex items-center gap-3">
			<Logo size={36} />
			<div class="min-w-0">
				<p class="text-xs text-muted-foreground">Shared with you through Berth</p>
				<h1 class="truncate font-mono text-[0.9375rem] font-semibold tracking-tight" title={data.image}>{data.image}</h1>
			</div>
		</div>

		{#if data.state !== 'active'}
			<div class="flex flex-col items-center gap-2 py-6 text-center">
				<span class="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground"><Link2Off class="size-5" /></span>
				<p class="text-[0.8125rem] font-medium">This link {data.state === 'used' ? 'has been used' : data.state === 'revoked' ? 'was turned off' : 'has expired'}</p>
				<p class="text-xs text-muted-foreground">Ask whoever sent it for a new one.</p>
			</div>
		{:else}
			{#if data.note}<p class="mb-4 rounded-lg bg-surface px-3 py-2 text-[0.8125rem]">{data.note}</p>{/if}
			<dl class="grid grid-cols-[6rem_minmax(0,1fr)] gap-y-1.5 text-[0.8125rem]">
				{#if data.size}<dt class="text-muted-foreground">Size</dt><dd>{bytes(data.size)} compressed</dd>{/if}
				<dt class="text-muted-foreground">Platform</dt>
				<dd>{data.platform ?? (data.platforms.length > 1 ? 'linux/amd64, or the first there is' : (data.platforms[0] ?? '—'))}</dd>
				{#if data.digest}<dt class="text-muted-foreground">Digest</dt><dd class="hash truncate" title={data.digest}>{data.digest}</dd>{/if}
				{#if data.created}<dt class="text-muted-foreground">Built</dt><dd>{dateTime(data.created)}</dd>{/if}
				<dt class="text-muted-foreground">Link</dt>
				<dd>
					{data.remaining === null ? 'Any number of downloads' : data.remaining === 1 ? 'One download left' : `${plural(data.remaining, 'download')} left`}{data.expiresAt
						? `, expires ${until(data.expiresAt)}`
						: ''}
				</dd>
			</dl>

			<a class="btn btn-primary mt-6 h-10 w-full {active ? '' : 'pointer-events-none opacity-50'}" href="{page.url.pathname}/download" download={data.filename} onclick={() => (started = true)}>
				<Download />Download {data.filename}
			</a>
			{#if started}
				<p class="mt-2 text-center text-xs text-muted-foreground">The download has started. Load it with <span class="hash">docker load -i {data.filename}</span></p>
			{/if}

			{#if data.remaining !== 1}
				<div class="mt-6">
					<p class="label">Or from a terminal</p>
					<CopyField value={curl} />
				</div>
			{:else}
				<p class="mt-4 rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
					This link works once. To download on a server instead, copy the link and run <span class="hash">curl -fLO …/download</span> there rather than clicking here.
				</p>
			{/if}
		{/if}
	</div>
</div>
