<script lang="ts">
	import { CircleAlert, Download, History, Link2, RefreshCw, Server, Settings, Trash2, User } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import { ago, dateTime } from '#lib/client/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const ACTIONS: Record<string, { label: string; icon: Component<{ class?: string }>; tone?: string }> = {
		'registry.sync': { label: 'Synced', icon: RefreshCw },
		'registry.sync-failed': { label: 'Sync failed', icon: CircleAlert, tone: 'text-danger' },
		'registry.add': { label: 'Added registry', icon: Server },
		'registry.update': { label: 'Changed registry', icon: Server },
		'registry.remove': { label: 'Removed registry', icon: Trash2, tone: 'text-danger' },
		'image.download': { label: 'Downloaded', icon: Download },
		'image.delete': { label: 'Deleted', icon: Trash2, tone: 'text-danger' },
		'link.create': { label: 'Made a share link', icon: Link2 },
		'link.download': { label: 'Downloaded by link', icon: Download, tone: 'text-primary' },
		'link.download-failed': { label: 'Link download broke off', icon: CircleAlert, tone: 'text-warning' },
		'link.revoke': { label: 'Revoked a link', icon: Link2 },
		'settings.update': { label: 'Changed settings', icon: Settings },
		'user.add': { label: 'Added user', icon: User },
		'user.role': { label: 'Changed role', icon: User },
		'user.remove': { label: 'Removed user', icon: User }
	};
	const meta = (a: string) => ACTIONS[a] ?? { label: a, icon: History };
</script>

<svelte:head><title>Activity · Wharf</title></svelte:head>

<div class="h-full overflow-y-auto">
	<PageHeader title="Activity" description="Syncs, downloads, share links and changes, newest first." />
	<div class="pb-12">
		{#if data.activity.length}
			<ul class="border-t border-border">
				{#each data.activity as a (a.id)}
					{@const m = meta(a.action)}
					<li class="flex items-start gap-3 border-b border-border/60 px-4 py-2.5 sm:px-8">
						<m.icon class="mt-0.5 size-4 shrink-0 {m.tone ?? 'text-muted-foreground'}" />
						<div class="min-w-0 flex-1 text-[0.8125rem]">
							<p><span class="font-medium">{m.label}</span>{#if a.target}<span class="text-muted-foreground"> · </span><span class="break-all">{a.target}</span>{/if}</p>
							{#if a.detail}<p class="mt-0.5 text-xs break-words text-muted-foreground">{a.detail}</p>{/if}
						</div>
						<div class="shrink-0 text-right text-[0.6875rem] text-muted-foreground">
							<p title={dateTime(a.at)}>{ago(a.at)}</p>
							{#if a.actor}<p class="max-w-40 truncate">{a.actor}</p>{/if}
						</div>
					</li>
				{/each}
			</ul>
		{:else}
			<div class="px-4 sm:px-8"><div class="card"><EmptyState icon={History} title="Nothing yet" /></div></div>
		{/if}
	</div>
</div>
