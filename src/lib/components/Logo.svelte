<script lang="ts">
	/** Wharf: a container on the quay above the water. The water moves unless `still`, or motion is turned off. */
	let { size = 28, still = false }: { size?: number; still?: boolean } = $props();
	// Gradient and clip ids must be unique per instance; the logo appears more than once on some pages.
	const id = $props.id();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" class="shrink-0">
	<defs>
		<linearGradient id="{id}-tile" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#132620" />
			<stop offset="1" stop-color="#07120e" />
		</linearGradient>
		<clipPath id="{id}-water"><rect x="5" y="21" width="22" height="6" /></clipPath>
	</defs>
	<rect width="32" height="32" rx="8" fill="url(#{id}-tile)" />
	<rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#5dd0a9" stroke-opacity="0.25" />
	<rect x="7.5" y="7.4" width="17" height="9" rx="1.4" fill="#fff" />
	<path d="M11.3 9.6v4.6M14.4 9.6v4.6M17.6 9.6v4.6M20.7 9.6v4.6" stroke="#132620" stroke-opacity="0.45" stroke-width="1.2" stroke-linecap="round" />
	<path d="M5.5 19.4h21" stroke="#5dd0a9" stroke-width="2.3" stroke-linecap="round" />
	<g clip-path="url(#{id}-water)">
		<path class={still ? '' : 'tide'} d="M6 24.6q2.5-1.6 5 0t5 0 5 0 5 0 5 0 5 0" fill="none" stroke="#5dd0a9" stroke-opacity="0.5" stroke-width="1.5" stroke-linecap="round" />
	</g>
</svg>

<style>
	.tide {
		animation: tide 5s linear infinite;
	}
	@keyframes tide {
		to {
			transform: translateX(-10px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tide {
			animation: none;
		}
	}
</style>
