<script lang="ts">
	import { untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { LoaderCircle, Save, Trash2, UserPlus } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { ago } from '#lib/client/format.ts';
	import { confirmAction, toast } from '#lib/client/state.svelte.ts';
	import type { Settings, User } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const admin = $derived(!!data.viewer?.admin);

	let form = $state<Settings>(untrack(() => ({ ...data.settings })));
	let saving = $state(false);

	let name = $state(untrack(() => data.me?.name ?? ''));
	let email = $state(untrack(() => data.me?.email ?? ''));
	let currentPassword = $state('');
	let newPassword = $state('');
	let savingAccount = $state(false);

	let adding = $state(false);
	let newUser = $state({ email: '', name: '', password: '', role: 'member' as User['role'] });

	async function save(e: SubmitEvent) {
		e.preventDefault();
		saving = true;
		try {
			const r = await api.put<{ settings: Settings }>('/api/settings', form);
			form = { ...r.settings };
			toast('success', 'Settings saved');
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't save", errorMessage(err));
		}
		saving = false;
	}

	async function saveAccount(e: SubmitEvent) {
		e.preventDefault();
		savingAccount = true;
		try {
			await api.put('/api/account', { name, email, currentPassword, newPassword });
			toast('success', 'Account updated');
			currentPassword = newPassword = '';
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't update your account", errorMessage(err));
		}
		savingAccount = false;
	}

	async function addUser(e: SubmitEvent) {
		e.preventDefault();
		try {
			await api.post('/api/users', newUser);
			toast('success', `Added ${newUser.email}`);
			adding = false;
			newUser = { email: '', name: '', password: '', role: 'member' };
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't add them", errorMessage(err));
		}
	}

	async function setRole(u: User, role: User['role']) {
		try {
			await api.patch(`/api/users/${u.id}`, { role });
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't change the role", errorMessage(err));
		}
	}

	async function removeUser(u: User) {
		if (!(await confirmAction({ title: `Remove ${u.email}?`, body: 'They are signed out and can no longer sign in.', confirmLabel: 'Remove', danger: true }))) return;
		try {
			await api.del(`/api/users/${u.id}`);
			await invalidateAll();
		} catch (err) {
			toast('error', "Couldn't remove them", errorMessage(err));
		}
	}
</script>

<svelte:head><title>Settings · Berth</title></svelte:head>

<div class="h-full overflow-y-auto">
	<PageHeader title="Settings" description="Syncing, share links, your account, and who can sign in." />

	<div class="max-w-3xl space-y-10 px-4 pb-12 sm:px-8">
		<form onsubmit={save} class="space-y-4">
			<h2 class="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">Syncing</h2>
			<div class="card grid gap-4 p-4 sm:grid-cols-2">
				<div>
					<label class="label" for="sync">Sync every registry every</label>
					<select id="sync" class="input" disabled={!admin} bind:value={form.syncMinutes}>
						{#each [[0, 'Never (only with Sync)'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, 'hour'], [360, '6 hours'], [1440, 'day']] as [v, l] (v)}
							<option value={v}>{l}</option>
						{/each}
						{#if ![0, 5, 15, 30, 60, 360, 1440].includes(form.syncMinutes)}<option value={form.syncMinutes}>{form.syncMinutes} minutes</option>{/if}
					</select>
				</div>
				<div>
					<label class="label" for="maxtags">Tags to index per repository</label>
					<input id="maxtags" class="input" type="number" min="1" max="100000" disabled={!admin} bind:value={form.maxTagsPerRepo} />
					<p class="mt-1 text-xs text-muted-foreground">Newest first where the registry says (ECR, Docker Hub, GitHub); otherwise by version.</p>
				</div>
			</div>

			<h2 class="pt-4 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">Share links</h2>
			<div class="card space-y-4 p-4">
				<div>
					<label class="label" for="public">Public address</label>
					<input id="public" class="input font-mono" placeholder={data.origin} disabled={!admin} bind:value={form.publicUrl} />
					<p class="mt-1 text-xs text-muted-foreground">Where people you send links to reach Berth, e.g. through your reverse proxy. Blank: the address you're using now.</p>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label class="label" for="hours">New links expire after (hours; 0 for never)</label>
						<input id="hours" class="input" type="number" min="0" disabled={!admin} bind:value={form.linkHours} />
					</div>
					<div>
						<label class="label" for="maxdl">and can be downloaded (times; 0 for no limit)</label>
						<input id="maxdl" class="input" type="number" min="0" disabled={!admin} bind:value={form.linkMaxDownloads} />
					</div>
				</div>
			</div>
			{#if admin}
				<div class="flex justify-end">
					<button class="btn btn-primary" disabled={saving}>{#if saving}<LoaderCircle class="animate-spin" />{:else}<Save />{/if}Save</button>
				</div>
			{/if}
			<p class="text-xs text-muted-foreground">Docker host: <span class="hash">{data.dockerHost}</span></p>
		</form>

		{#if data.me}
			<form id="account" onsubmit={saveAccount} class="space-y-4">
				<h2 class="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">Your account</h2>
				<div class="card grid gap-4 p-4 sm:grid-cols-2">
					<div>
						<label class="label" for="name">Name</label>
						<input id="name" class="input" autocomplete="name" bind:value={name} />
					</div>
					<div>
						<label class="label" for="email">Email</label>
						<input id="email" class="input" type="email" autocomplete="username" bind:value={email} />
					</div>
					<div>
						<label class="label" for="cur">Current password</label>
						<input id="cur" class="input" type="password" autocomplete="current-password" bind:value={currentPassword} />
					</div>
					<div>
						<label class="label" for="new">New password</label>
						<input id="new" class="input" type="password" autocomplete="new-password" placeholder="Leave blank to keep it" bind:value={newPassword} />
					</div>
				</div>
				<div class="flex justify-end">
					<button class="btn btn-secondary" disabled={savingAccount}>{#if savingAccount}<LoaderCircle class="animate-spin" />{/if}Update account</button>
				</div>
			</form>
		{/if}

		{#if admin && data.me}
			<section class="space-y-4">
				<div class="flex items-center justify-between">
					<h2 class="text-[0.6875rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">People</h2>
					<button class="btn btn-secondary btn-sm" onclick={() => (adding = true)}><UserPlus />Add someone</button>
				</div>
				<div class="card divide-y divide-border">
					{#each data.users as u (u.id)}
						<div class="flex items-center gap-3 px-4 py-2.5">
							<span class="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-[0.6875rem] font-semibold text-primary uppercase">{(u.name ?? u.email).slice(0, 1)}</span>
							<div class="min-w-0 flex-1">
								<p class="truncate text-[0.8125rem] font-medium">{u.name ?? u.email}{u.id === data.me.id ? ' (you)' : ''}</p>
								<p class="truncate text-[0.6875rem] text-muted-foreground">{u.name ? `${u.email} · ` : ''}signed in {ago(u.lastLoginAt)}</p>
							</div>
							<select class="input h-8 w-28 text-xs" value={u.role} disabled={u.id === data.me.id} onchange={(e) => setRole(u, e.currentTarget.value as User['role'])}>
								<option value="admin">Admin</option>
								<option value="member">Member</option>
							</select>
							<button class="btn btn-ghost btn-icon btn-sm hover:text-danger" disabled={u.id === data.me.id} aria-label="Remove {u.email}" onclick={() => removeUser(u)}><Trash2 /></button>
						</div>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground">Members search, download and make share links. Admins also manage registries, deletes, people and settings.</p>
			</section>
		{/if}
	</div>
</div>

<Dialog bind:open={adding} title="Add someone" width="max-w-md">
	<form id="add-user" class="space-y-3" onsubmit={addUser}>
		<div>
			<label class="label" for="nu-email">Email</label>
			<input id="nu-email" class="input" type="email" required bind:value={newUser.email} />
		</div>
		<div>
			<label class="label" for="nu-name">Name <span class="font-normal">(optional)</span></label>
			<input id="nu-name" class="input" bind:value={newUser.name} />
		</div>
		<div>
			<label class="label" for="nu-pw">Password <span class="font-normal">(they can change it)</span></label>
			<input id="nu-pw" class="input" type="password" autocomplete="new-password" minlength="8" required bind:value={newUser.password} />
		</div>
		<div>
			<label class="label" for="nu-role">Role</label>
			<select id="nu-role" class="input" bind:value={newUser.role}>
				<option value="member">Member</option>
				<option value="admin">Admin</option>
			</select>
		</div>
	</form>
	{#snippet footer()}
		<button class="btn btn-ghost" onclick={() => (adding = false)}>Cancel</button>
		<button class="btn btn-primary" form="add-user">Add</button>
	{/snippet}
</Dialog>
