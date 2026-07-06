<script lang="ts">
	import { page } from '$app/stores';
	let { data } = $props();
	let code = $state($page.url.searchParams.get('code') || '');
	let verifying = $state(false);
	let done = $state(false);
	let errorMsg = $state('');

	async function verify() {
		if (!data.accessToken) return;
		verifying = true; errorMsg = '';
		try {
			const res = await fetch(data.serverUrl + '/auth/cli/verify', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, token: data.accessToken }),
			});
			if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Verification failed'); }
			done = true;
		} catch (e) { errorMsg = e instanceof Error ? e.message : 'Unknown error'; }
		finally { verifying = false; }
	}
</script>

<svelte:head><title>Authorise CLI - TinyOwl</title></svelte:head>
<div class="content-column py-20 text-center">
	<h1 class="text-2xl font-serif">TinyOwl CLI</h1>
	{#if !data.user}
		<p class="mt-6 text-owl-600">Please <a href="/">sign in</a> first, then return to this page.</p>
	{:else if done}
		<div class="mt-6 mx-auto max-w-sm rounded-lg border border-green-300 bg-green-50 p-6 text-left dark:bg-green-950 dark:border-green-800">
			<h2 class="font-serif text-lg text-green-800 dark:text-green-300">Authorised</h2>
			<p class="mt-1 text-sm text-green-700 dark:text-green-400">You can close this page and return to your terminal.</p>
		</div>
	{:else}
		<p class="mt-4 text-sm text-owl-500 font-sans">Signed in as <strong>{data.user.email ?? data.user.id}</strong></p>
		{#if code}
			<p class="mt-6 text-sm text-owl-500 font-sans">Confirm device code:</p>
			<div class="mx-auto mt-2 max-w-[200px] rounded-md border border-owl-300 bg-white dark:bg-owl-900 py-3 font-mono text-2xl tracking-[0.2em]">{code}</div>
		{:else}
			<label class="mt-6 block text-sm text-owl-500 font-sans">Enter the code shown in your terminal:</label>
			<input type="text" bind:value={code} placeholder="abcd1234" class="mx-auto mt-2 block w-48 rounded-md border border-owl-300 px-4 py-3 text-center font-mono text-xl tracking-[0.2em] focus:border-owl-500 focus:outline-none dark:bg-owl-900 dark:border-owl-700" maxlength="8" />
		{/if}
		<button onclick={verify} disabled={verifying || code.length < 8} class="mt-6 rounded-full bg-owl-900 px-6 py-2.5 font-sans text-sm text-white hover:bg-owl-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{verifying ? 'Authorising...' : 'Authorise CLI Access'}</button>
		{#if errorMsg}<p class="mt-4 text-sm text-red-600 font-sans">{errorMsg}</p>{/if}
	{/if}
</div>
