<script lang="ts">
	import { page } from '$app/stores';
	let { data } = $props();
	let code = $state($page.url.searchParams.get('code') || '');
	let verifying = $state(false), done = $state(false), errorMsg = $state('');
	async function verify() {
		if (!data.accessToken) return;
		verifying = true; errorMsg = '';
		try {
			const res = await fetch(data.serverUrl + '/auth/cli/verify', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ code, token: data.accessToken }),
			});
			if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Verification failed'); }
			done = true;
		} catch (e) { errorMsg = e instanceof Error ? e.message : 'Unknown error'; }
		finally { verifying = false; }
	}
</script>
<svelte:head><title>Authorise CLI \u2014 TinyOwl</title></svelte:head>
<div class="w-full max-w-sm text-center">
	<h1 class="text-lg font-semibold text-[#15110f] dark:text-[#f7f2ee] mb-4">TinyOwl CLI</h1>
	{#if !data.user}<p class="text-sm text-[#8b817c] dark:text-neutral-500">Please <a href="/auth/login" class="underline">sign in</a> first, then return.</p>
	{:else if done}
		<div class="rounded-lg border border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4 text-left"><h2 class="font-semibold text-green-800 dark:text-green-300">Authorised</h2><p class="mt-1 text-sm text-green-700 dark:text-green-400">You can close this page and return to your terminal.</p></div>
	{:else}
		<p class="text-xs text-[#8b817c] dark:text-neutral-500">Signed in as <strong>{data.user.email ?? data.user.id}</strong></p>
		{#if code}
			<p class="mt-4 text-xs text-[#8b817c] dark:text-neutral-500">Confirm device code:</p>
			<div class="mx-auto mt-2 max-w-[200px] rounded-md border border-[#eadfdb] dark:border-neutral-800 bg-white dark:bg-[#0B0B0B] py-3 font-mono text-2xl tracking-[0.2em] text-[#15110f] dark:text-neutral-200">{code}</div>
		{:else}
			<label class="mt-4 block text-xs text-[#8b817c] dark:text-neutral-500">Enter code from terminal:</label>
			<input type="text" bind:value={code} placeholder="abcd1234" maxlength="8" class="mx-auto mt-2 block w-48 rounded-md border border-[#eadfdb] dark:border-neutral-800 bg-white dark:bg-[#0B0B0B] px-4 py-3 text-center font-mono text-xl tracking-[0.2em] text-[#15110f] dark:text-neutral-200 focus:border-[#8b817c] focus:outline-none" />
		{/if}
		<button onclick={verify} disabled={verifying || code.length < 8} class="mt-6 rounded-full bg-[#15110f] dark:bg-[#f3eee8] dark:text-[#090807] text-[#fffaf7] px-6 py-2 text-sm font-semibold hover:bg-[#ad0000] dark:hover:bg-[#ff6b5f] disabled:opacity-40 transition-colors">{verifying ? 'Authorising\u2026' : 'Authorise CLI Access'}</button>
		{#if errorMsg}<p class="mt-4 text-xs text-red-500">{errorMsg}</p>{/if}
	{/if}
</div>