<script lang="ts">
	/** Berth: containers docked above the water line. */
	let { size = 28 }: { size?: number } = $props();
	// Gradient ids must be unique per instance; the logo appears more than once on some pages.
	const id = $props.id();
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" class="shrink-0">
	<defs>
		<linearGradient id="{id}-tile" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#17252c" />
			<stop offset="1" stop-color="#0c1418" />
		</linearGradient>
		<linearGradient id="{id}-box" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#9eeaf6" />
			<stop offset="1" stop-color="#4cc3d9" />
		</linearGradient>
	</defs>
	<rect width="32" height="32" rx="8" fill="url(#{id}-tile)" />
	<rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="#5fd4e8" stroke-opacity="0.25" />
	<rect x="11.6" y="7.6" width="8.8" height="6.2" rx="1.3" fill="url(#{id}-box)" />
	<rect x="6.8" y="14.8" width="8.8" height="6.2" rx="1.3" fill="url(#{id}-box)" opacity="0.85" />
	<rect x="16.4" y="14.8" width="8.8" height="6.2" rx="1.3" fill="url(#{id}-box)" opacity="0.7" />
	<path d="M6 25.2q2.5-1.7 5 0t5 0 5 0 5 0" fill="none" stroke="#5fd4e8" stroke-opacity="0.65" stroke-width="1.6" stroke-linecap="round" />
</svg>
