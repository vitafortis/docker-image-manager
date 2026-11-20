<script lang="ts">
	import { Cloud, Container, Package, Server, Ship } from '@lucide/svelte';
	import type { RegistryKind } from '#lib/types.ts';

	let { kind, class: cls = 'size-4' }: { kind: RegistryKind; class?: string } = $props();
	const icons = { registry: Server, ecr: Cloud, dockerhub: Ship, ghcr: Package, docker: Container };
	const Icon = $derived(icons[kind]);
</script>

<Icon class={cls} />
