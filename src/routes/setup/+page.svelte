<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';

	async function setup(email: string, password: string) {
		try {
			await api.post('/api/auth/setup', { email, password });
			await invalidateAll();
			goto('/');
		} catch (err) {
			return errorMessage(err);
		}
	}
</script>

<svelte:head><title>Set up · Berth</title></svelte:head>

<AuthCard
	title="Set up Berth"
	subtitle="Create the account that signs in to this console. Next, add your registries."
	cta="Create account"
	confirm
	hint="Registry credentials are stored encrypted. Keep Berth on your LAN, a VPN, or behind your reverse proxy."
	onsubmit={setup}
/>
