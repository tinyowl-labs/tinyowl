<script lang="ts">
	import { createClient } from '$lib/supabase/client';
	import { goto } from '$app/navigation';
	let { data } = $props();
</script>
<svelte:head><title>Profile - TinyOwl</title></svelte:head>
<div class="content-column py-20">
	<h1 class="text-2xl font-serif">Profile</h1>
	{#if data.user}
		<div class="mt-6 rounded-lg border border-owl-200 bg-white dark:bg-owl-900 p-6">
			<p class="text-sm text-owl-500 font-sans">Signed in as</p>
			<p class="mt-1 font-serif text-lg">{data.user.email}</p>
		</div>
		<div class="mt-8 space-y-4 font-sans text-sm">
			<a href="/cli/device" class="block text-owl-700 underline decoration-owl-300">Authorise CLI</a>
			<button onclick={async () => { const supabase = createClient(); await supabase.auth.signOut(); goto('/'); }} class="text-owl-500 underline decoration-owl-200 hover:text-owl-700">Sign out</button>
		</div>
	{:else}
		<p class="mt-4 text-owl-600">Please <a href="/">sign in</a> to view your profile.</p>
	{/if}
</div>
