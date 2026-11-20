<script lang="ts">
	import { untrack } from 'svelte';
	import { CircleCheck, LoaderCircle, PlugZap } from '@lucide/svelte';
	import Dialog from './Dialog.svelte';
	import KindIcon from './KindIcon.svelte';
	import { api, errorMessage } from '#lib/client/api.ts';
	import { toast } from '#lib/client/state.svelte.ts';
	import { KIND_ORDER, KINDS } from '#lib/registries.ts';
	import type { Registry, RegistryKind } from '#lib/types.ts';

	let { open = $bindable(false), registry = null, onsaved }: { open: boolean; registry?: Registry | null; onsaved?: (r: Registry) => void } = $props();

	type Form = {
		kind: RegistryKind;
		name: string;
		url: string;
		username: string;
		password: string;
		region: string;
		accountId: string;
		awsAuth: 'keys' | 'environment';
		accessKeyId: string;
		secretAccessKey: string;
		sessionToken: string;
		namespaces: string;
		owner: string;
		ownerType: 'user' | 'org';
		repositories: string;
		include: string;
	};

	function blank(r: Registry | null): Form {
		const c = r?.config ?? {};
		return {
			kind: r?.kind ?? 'registry',
			name: r?.name ?? '',
			url: c.url ?? '',
			username: c.username ?? '',
			password: '',
			region: c.region ?? 'us-east-1',
			accountId: c.accountId ?? '',
			awsAuth: c.awsAuth ?? 'keys',
			accessKeyId: '',
			secretAccessKey: '',
			sessionToken: '',
			namespaces: (c.namespaces ?? []).join(', '),
			owner: c.owner ?? '',
			ownerType: c.ownerType ?? 'user',
			repositories: (c.repositories ?? []).join('\n'),
			include: (c.include ?? []).join(', ')
		};
	}

	let form = $state<Form>(blank(null));
	// Adding starts at the kind picker; editing goes straight to the form.
	let picking = $state(true);
	let busy = $state<'' | 'test' | 'save'>('');
	let tested = $state<{ repositories: number; sample: string[] } | null>(null);
	let error = $state('');

	$effect(() => {
		if (!open) return;
		untrack(() => {
			form = blank(registry);
			picking = !registry;
			tested = null;
			error = '';
		});
	});

	// Settings changed since the last test: the result no longer says anything.
	$effect(() => {
		void JSON.stringify(form);
		untrack(() => {
			tested = null;
			error = '';
		});
	});

	const has = (k: string) => registry?.secrets.includes(k as never) ?? false;
	const secretHint = (k: string) => (has(k) ? 'Saved; leave blank to keep it' : '');

	function payload() {
		return { ...form, id: registry?.id };
	}

	async function test() {
		busy = 'test';
		error = '';
		try {
			tested = await api.post<{ repositories: number; sample: string[] }>('/api/registries/test', payload());
		} catch (err) {
			error = errorMessage(err);
		}
		busy = '';
	}

	async function save(e: SubmitEvent) {
		e.preventDefault();
		busy = 'save';
		error = '';
		try {
			const r = registry ? await api.put<{ registry: Registry }>(`/api/registries/${registry.id}`, payload()) : await api.post<{ registry: Registry }>('/api/registries', payload());
			toast('success', registry ? 'Registry saved' : 'Registry added', 'Syncing its images now.');
			open = false;
			onsaved?.(r.registry);
		} catch (err) {
			error = errorMessage(err);
		}
		busy = '';
	}

	function pick(kind: RegistryKind) {
		form.kind = kind;
		form.name = '';
		picking = false;
	}
</script>

<Dialog bind:open title={registry ? `Edit ${registry.name}` : picking ? 'Add a registry' : `Add ${KINDS[form.kind].label}`} width="max-w-xl">
	{#if picking}
		<div class="grid gap-2">
			{#each KIND_ORDER as k (k)}
				<button type="button" class="flex items-start gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/50" onclick={() => pick(k)}>
					<span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><KindIcon kind={k} /></span>
					<span>
						<span class="block text-[0.8125rem] font-medium">{KINDS[k].label}</span>
						<span class="block text-xs text-muted-foreground">{KINDS[k].blurb}</span>
					</span>
				</button>
			{/each}
		</div>
	{:else}
		<form id="registry-form" class="space-y-4" onsubmit={save}>
			<div>
				<label class="label" for="reg-name">Name</label>
				<input id="reg-name" class="input" placeholder={KINDS[form.kind].label} maxlength="80" bind:value={form.name} />
			</div>

			{#if form.kind === 'registry'}
				<div>
					<label class="label" for="reg-url">Address</label>
					<input id="reg-url" class="input font-mono" placeholder="localhost:5000 or https://registry.example.com" required bind:value={form.url} />
					<p class="mt-1 text-xs text-muted-foreground">localhost and 127.0.0.1 default to http; everything else to https.</p>
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label class="label" for="reg-user">Username <span class="font-normal">(blank for anonymous)</span></label>
						<input id="reg-user" class="input" autocomplete="off" bind:value={form.username} />
					</div>
					<div>
						<label class="label" for="reg-pass">Password or token</label>
						<input id="reg-pass" class="input" type="password" autocomplete="new-password" placeholder={secretHint('password')} bind:value={form.password} />
					</div>
				</div>
			{:else if form.kind === 'ecr'}
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label class="label" for="reg-region">Region</label>
						<input id="reg-region" class="input font-mono" required placeholder="us-east-1" bind:value={form.region} />
					</div>
					<div>
						<label class="label" for="reg-account">Account ID <span class="font-normal">(blank: the keys' own)</span></label>
						<input id="reg-account" class="input font-mono" inputmode="numeric" placeholder="123456789012" bind:value={form.accountId} />
					</div>
				</div>
				<div>
					<p class="label">Credentials</p>
					<div class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-[0.8125rem]">
						{#each [['keys', 'Access keys'], ['environment', 'From the environment']] as [v, l] (v)}
							<button type="button" class="rounded-md px-3 py-1.5 {form.awsAuth === v ? 'bg-card font-medium shadow-surface' : 'text-muted-foreground'}" onclick={() => (form.awsAuth = v as Form['awsAuth'])}>{l}</button>
						{/each}
					</div>
				</div>
				{#if form.awsAuth === 'keys'}
					<div class="grid gap-4 sm:grid-cols-2">
						<div>
							<label class="label" for="reg-akid">Access key ID</label>
							<input id="reg-akid" class="input font-mono" autocomplete="off" placeholder={secretHint('accessKeyId') || 'AKIA…'} bind:value={form.accessKeyId} />
						</div>
						<div>
							<label class="label" for="reg-secret">Secret access key</label>
							<input id="reg-secret" class="input" type="password" autocomplete="new-password" placeholder={secretHint('secretAccessKey')} bind:value={form.secretAccessKey} />
						</div>
					</div>
					<div>
						<label class="label" for="reg-session">Session token <span class="font-normal">(only for temporary keys)</span></label>
						<input id="reg-session" class="input" type="password" autocomplete="new-password" placeholder={secretHint('sessionToken')} bind:value={form.sessionToken} />
					</div>
					<p class="text-xs text-muted-foreground">
						The keys need <span class="hash">ecr:GetAuthorizationToken</span>, <span class="hash">ecr:DescribeRepositories</span>, <span class="hash">ecr:DescribeImages</span>,
						<span class="hash">ecr:BatchGetImage</span> and <span class="hash">ecr:GetDownloadUrlForLayer</span> (the AmazonEC2ContainerRegistryReadOnly policy), plus
						<span class="hash">ecr:BatchDeleteImage</span> to delete tags.
					</p>
				{:else}
					<p class="rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
						Berth uses what the AWS CLI would find in its container: <span class="hash">AWS_ACCESS_KEY_ID</span>/<span class="hash">AWS_SECRET_ACCESS_KEY</span>, an EKS service account (IRSA), an ECS task role, or the EC2
						instance role.
					</p>
				{/if}
			{:else if form.kind === 'dockerhub'}
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label class="label" for="reg-user">Username <span class="font-normal">(blank for public only)</span></label>
						<input id="reg-user" class="input" autocomplete="off" bind:value={form.username} />
					</div>
					<div>
						<label class="label" for="reg-pass">Personal access token</label>
						<input id="reg-pass" class="input" type="password" autocomplete="new-password" placeholder={secretHint('password') || 'dckr_pat_…'} bind:value={form.password} />
					</div>
				</div>
				<div>
					<label class="label" for="reg-ns">Namespaces <span class="font-normal">(users or orgs to list; blank: your username)</span></label>
					<input id="reg-ns" class="input" placeholder="acme, acme-labs" bind:value={form.namespaces} />
				</div>
			{:else if form.kind === 'ghcr'}
				<div class="grid gap-4 sm:grid-cols-2">
					<div>
						<label class="label" for="reg-owner">Owner <span class="font-normal">(blank: the token's user)</span></label>
						<input id="reg-owner" class="input" placeholder="acme" bind:value={form.owner} />
					</div>
					<div>
						<p class="label">Owner is</p>
						<div class="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-[0.8125rem]">
							{#each [['user', 'A user'], ['org', 'An organization']] as [v, l] (v)}
								<button type="button" class="rounded-md px-3 py-1.5 {form.ownerType === v ? 'bg-card font-medium shadow-surface' : 'text-muted-foreground'}" onclick={() => (form.ownerType = v as Form['ownerType'])}>{l}</button>
							{/each}
						</div>
					</div>
				</div>
				<div>
					<label class="label" for="reg-pass">GitHub token</label>
					<input id="reg-pass" class="input" type="password" autocomplete="new-password" placeholder={secretHint('password') || 'ghp_… with read:packages'} bind:value={form.password} />
				</div>
			{:else if form.kind === 'docker'}
				<p class="rounded-lg bg-surface px-3 py-2 text-xs text-muted-foreground">
					Lists the images on the Docker Engine Berth can reach (mount <span class="hash">/var/run/docker.sock</span>, or set <span class="hash">BERTH_DOCKER_HOST</span>). Downloads are
					<span class="hash">docker save</span> exports.
				</p>
			{/if}

			{#if form.kind !== 'docker'}
				<details class="group rounded-lg border border-border" open={!!(form.repositories || form.include)}>
					<summary class="cursor-pointer px-3 py-2 text-[0.8125rem] font-medium select-none">Which repositories</summary>
					<div class="space-y-4 border-t border-border px-3 py-3">
						<div>
							<label class="label" for="reg-repos">Also index these <span class="font-normal">(one per line)</span></label>
							<textarea id="reg-repos" class="input h-20 py-2 font-mono text-xs" placeholder={form.kind === 'dockerhub' ? 'library/nginx\nbitnami/redis' : 'team/api\ntools/runner'} bind:value={form.repositories}></textarea>
							<p class="mt-1 text-xs text-muted-foreground">For registries that can't list their repositories, or public images you want searchable.</p>
						</div>
						<div>
							<label class="label" for="reg-include">Only index repositories matching <span class="font-normal">(globs, comma-separated; blank: all)</span></label>
							<input id="reg-include" class="input font-mono text-xs" placeholder="team/*, *-api" bind:value={form.include} />
						</div>
					</div>
				</details>
			{/if}

			{#if error}<p class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>{/if}
			{#if tested}
				<p class="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
					<CircleCheck class="mt-px size-3.5 shrink-0" />
					<span>
						Connected.
						{#if form.kind !== 'docker'}
							{tested.repositories} {tested.repositories === 1 ? 'repository' : 'repositories'} to index{tested.sample.length ? `: ${tested.sample.join(', ')}${tested.repositories > tested.sample.length ? '…' : ''}` : '.'}
						{/if}
					</span>
				</p>
			{/if}
		</form>
	{/if}
	{#snippet footer()}
		{#if !picking}
			{#if !registry}<button type="button" class="btn btn-ghost mr-auto" onclick={() => (picking = true)}>Back</button>{/if}
			<button type="button" class="btn btn-secondary" disabled={!!busy} onclick={test}>
				{#if busy === 'test'}<LoaderCircle class="animate-spin" />{:else}<PlugZap />{/if}Test
			</button>
			<button class="btn btn-primary" form="registry-form" disabled={!!busy}>
				{#if busy === 'save'}<LoaderCircle class="animate-spin" />{/if}{registry ? 'Save' : 'Add and sync'}
			</button>
		{/if}
	{/snippet}
</Dialog>
