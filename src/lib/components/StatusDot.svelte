<script lang="ts">
	import type { Registry } from '#lib/types.ts';

	/** A registry's state: syncing (pulsing), ok, failed, or not synced yet. */
	let { registry, class: cls = '' }: { registry: Pick<Registry, 'status' | 'syncing' | 'lastError'>; class?: string } = $props();
	const tone = $derived(registry.syncing ? 'bg-primary animate-pulse' : registry.status === 'ok' ? (registry.lastError ? 'bg-warning' : 'bg-success') : registry.status === 'error' ? 'bg-danger' : 'bg-muted-foreground/50');
	const label = $derived(registry.syncing ? 'Syncing' : registry.status === 'ok' ? (registry.lastError ? 'Synced with errors' : 'Synced') : registry.status === 'error' ? 'Failed' : 'Not synced yet');
</script>

<span class="inline-block size-2 shrink-0 rounded-full {tone} {cls}" title={label} aria-label={label}></span>
