<script lang="ts">
	import { page } from '$app/state';
	import { goto, invalidateAll } from '$app/navigation';
	import AuthCard from '#lib/components/AuthCard.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';

	const next = $derived.by(() => {
		const n = page.url.searchParams.get('next');
		return n?.startsWith('/') && !n.startsWith('//') ? n : '/';
	});

	async function login(email: string, password: string) {
		try {
			await api.post('/api/auth/login', { email, password });
			await invalidateAll();
			goto(next);
		} catch (err) {
			return errorMessage(err);
		}
	}
</script>

<svelte:head><title>Sign in · Berth</title></svelte:head>

<AuthCard title="Welcome back" subtitle="Sign in to your image registries." cta="Sign in" onsubmit={login} />
