<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import { writeClipboard } from '#lib/client/clipboard.ts';
	import { toast } from '#lib/client/state.svelte.ts';

	/** A read-only value with a copy button: pull commands, digests, share links. */
	let { value, label, mono = true }: { value: string; label?: string; mono?: boolean } = $props();
	let copied = $state(false);

	async function copy() {
		if (await writeClipboard(value)) {
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} else toast('error', 'Could not copy to the clipboard');
	}
</script>

<div class="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-surface py-1 pr-1 pl-3">
	{#if label}<span class="shrink-0 text-[0.6875rem] font-medium text-muted-foreground">{label}</span>{/if}
	<input class="min-w-0 flex-1 bg-transparent text-[0.8125rem] outline-none {mono ? 'font-mono text-xs' : ''}" readonly {value} onfocus={(e) => e.currentTarget.select()} />
	<button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Copy" title="Copy" onclick={copy}>
		{#if copied}<Check class="text-success" />{:else}<Copy />{/if}
	</button>
</div>
