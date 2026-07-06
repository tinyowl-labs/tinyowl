<script lang="ts">
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { createClient } from '$lib/supabase/client';
	import { goto } from '$app/navigation';
	import redthreadSvg from '$lib/assets/redthread.svg?raw';
	import labyrinthSvg from '$lib/assets/labyrinth.svg?raw';
	import { onMount } from 'svelte';
	import { setPreference, isDark } from '$lib/stores/theme.svelte';

	const dark = $derived(isDark());
	const owlSvg = $derived(dark
		? redthreadSvg.replace(/fill:#000000/g, 'fill:currentColor').replace(/stroke:#000000/g, 'stroke:currentColor').replace(/fill:#ffffff/g, 'fill:#000000').replace(/stroke:#ffffff/g, 'stroke:#000000')
		: redthreadSvg);

	function toggleTheme() { setPreference('bgBase', isDark() ? 'paper' : 'dark'); }

	let isMounted = $state(false);
	let showLogin = $state(false);
	let loginEmail = $state('');
	let loginPassword = $state('');
	let loginError = $state('');
	let loginLoading = $state(false);
	let query = $state('');
	let focused = $state(false);
	let selected = $state(-1);
	let inputEl = $state<HTMLInputElement>();

	let { data } = $props();
	const hasSession = $derived(Boolean(data?.user));
	onMount(() => { isMounted = true; });

	async function handleLogin(e: SubmitEvent) {
		e.preventDefault(); loginLoading = true; loginError = '';
		const supabase = createClient();
		const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
		if (error) loginError = error.message; else { showLogin = false; goto('/profile'); }
		loginLoading = false;
	}

	const suggestions = [
		{ label: 'Etruscan funerary deposits near Verona', href: '/search?q=etruscan+funerary+verona' },
		{ label: 'Roman pottery in Northern Europe', href: '/search?q=roman+pottery+northern+europe' },
		{ label: 'Bronze Age burials in the Near East', href: '/search?q=bronze+age+burials+near+east' },
		{ label: 'Iron Age hillforts in Britain', href: '/search?q=iron+age+hillforts+britain' },
		{ label: 'Neolithic settlements in Southeast Asia', href: '/search?q=neolithic+settlements+southeast+asia' },
		{ label: 'Marble fragments in the Mediterranean', href: '/search?q=marble+fragments+mediterranean' },
	];

	const results = $derived(query.trim()
		? suggestions.filter(s => s.label.toLowerCase().includes(query.toLowerCase()))
		: suggestions);

	const showDropdown = $derived(focused && results.length > 0);

	function handleKeydown(e: KeyboardEvent) {
		if (!showDropdown) return;
		if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, results.length - 1); }
		if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); }
		if (e.key === 'Enter' && selected >= 0) { goto(results[selected].href); }
		if (e.key === 'Escape') { query = ''; selected = -1; inputEl?.blur(); }
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const q = query.trim();
		if (q) goto(`/search?q=${encodeURIComponent(q)}`);
	}
</script>

<svelte:head><title>TinyOwl</title></svelte:head>

<header class="home-header fixed top-0 inset-x-0 z-50 flex h-11 shrink-0 items-center justify-between px-4">
	<a href="/" aria-label="tinyowl" class="flex items-center gap-2.5">
		<span class="home-logo-icon size-5 shrink-0 inline-block [&>svg]:h-full [&>svg]:w-full">
			{#if isMounted}{@html owlSvg}{/if}
		</span>
		<span class="home-logo-text text-sm font-semibold">tinyowl</span>
	</a>
	<nav class="flex items-center gap-1">
		<a href="/docs" class="home-nav-link rounded-md px-3 py-1.5 text-xs font-medium transition-colors">Docs</a>
		{#if hasSession}
			<a href="/profile" class="home-nav-link rounded-md px-3 py-1.5 text-xs font-medium transition-colors">Profile</a>
		{:else}
			<button type="button" onclick={() => (showLogin = true)} class="home-nav-signin cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors">Sign in</button>
		{/if}
	</nav>
</header>

{#if showLogin}
	<button class="fixed inset-0 z-50 bg-black/20" onclick={() => (showLogin = false)} aria-label="Close"></button>
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<div class="w-full max-w-sm rounded-xl border border-neutral-200/80 bg-white/95 backdrop-blur-md dark:bg-neutral-900/95 dark:border-neutral-700/80 p-6 shadow-xl">
			<h2 class="font-serif text-lg dark:text-neutral-100">Sign in</h2>
			<form onsubmit={handleLogin} class="mt-4 space-y-3 font-sans">
				<label class="block"><span class="text-xs text-neutral-500">Email</span><input type="email" bind:value={loginEmail} required class="mt-1 block w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm dark:text-neutral-100 focus:border-neutral-400 focus:outline-none" /></label>
				<label class="block"><span class="text-xs text-neutral-500">Password</span><input type="password" bind:value={loginPassword} required class="mt-1 block w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-sm dark:text-neutral-100 focus:border-neutral-400 focus:outline-none" /></label>
				{#if loginError}<p class="text-xs text-red-500">{loginError}</p>{/if}
				<button type="submit" disabled={loginLoading} class="w-full rounded-full bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-50 transition-colors">{loginLoading ? 'Signing in…' : 'Sign in'}</button>
			</form>
		</div>
	</div>
{/if}

<main class="home-page relative w-full overflow-hidden bg-white pt-11 dark:bg-black" onkeydown={handleKeydown}>
	{#if isMounted}
		<div class="relative min-h-[150vh] w-full">
			<!-- Search — top 50vh -->
			<div class="absolute inset-x-0 top-0 flex justify-center" style="height: 50vh;">
				<div class="flex flex-col items-center pt-[18vh] w-full max-w-xl px-4">
					<div class="relative w-full">
						<form onsubmit={handleSubmit}>
							<SearchIcon class="absolute left-3.5 top-3.5 z-10 size-4 text-[#8b817c] dark:text-neutral-500" />
							<input
								bind:this={inputEl}
								bind:value={query}
								onfocus={() => (focused = true)}
								onblur={() => setTimeout(() => (focused = false), 150)}
								oninput={() => (selected = -1)}
								placeholder="Search projects, entities, periods…"
								class="w-full rounded-xl border border-[#eadfdb] dark:border-neutral-800 bg-white dark:bg-[#0B0B0B] pl-10 pr-4 py-3 text-sm text-[#15110f] dark:text-neutral-200 placeholder:text-[#c4b8b1] dark:placeholder:text-neutral-600 focus:border-[#8b817c] dark:focus:border-neutral-700 focus:outline-none transition-colors"
							/>
						</form>

						{#if showDropdown}
							<div class="absolute left-0 right-0 top-full mt-2 rounded-xl bg-white dark:bg-[#121212] border border-[#eadfdb] dark:border-neutral-800 overflow-hidden shadow-lg z-20">
								{#each results as item, i}
									<a href={item.href} class="flex items-center gap-3 px-4 py-3 {selected === i ? 'bg-[#f1e8e3] dark:bg-neutral-800' : 'hover:bg-[#f8f5f3] dark:hover:bg-neutral-800/50'} transition-colors no-underline">
										<SearchIcon class="size-4 text-[#c4b8b1] dark:text-neutral-500 shrink-0" />
										<span class="text-sm text-[#15110f] dark:text-neutral-200">{item.label}</span>
									</a>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Labyrinth — starts at 50vh -->
			<div class="labyrinth absolute left-1/2 -translate-x-1/2 w-[75%] overflow-hidden pointer-events-none text-black dark:text-white" style="top: 50vh; height: 100vh;">
				<div class="absolute inset-0 opacity-[0.06] dark:opacity-[0.09]">
					<div class="w-full">{@html labyrinthSvg}</div>
				</div>
			</div>
		</div>
	{/if}
</main>

<button type="button" onclick={toggleTheme} class="theme-toggle fixed bottom-4 right-4 z-50">
	<SunIcon class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
	<MoonIcon class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
	<span class="sr-only">Toggle theme</span>
</button>

<style>
	.home-header { background: #fbf7f5; border-bottom: 1px solid #eadfdb; color: #15110f; }
	:global(.dark) .home-header { background: #050505; border-bottom-color: #1f1b19; color: #f7f2ee; }
	.home-logo-icon, .home-logo-text { color: inherit; }
	.home-page { color: #111111; }
	:global(.dark) .home-page { color: #f7f2ee; }
	.home-nav-link { color: #8b817c; background: transparent; }
	.home-nav-link:hover { color: #15110f; background: #f1e8e3; }
	:global(.dark) .home-nav-link { color: #9b918b; }
	:global(.dark) .home-nav-link:hover { color: #f7f2ee; background: #181412; }
	.home-nav-signin { background: #15110f; color: #fffaf7; }
	.home-nav-signin:hover { background: #ad0000; }
	:global(.dark) .home-nav-signin { background: #f3eee8; color: #090807; }
	:global(.dark) .home-nav-signin:hover { background: #ff6b5f; }
	.labyrinth :global(svg) { width: 100%; height: auto; }
	.labyrinth :global(circle), .labyrinth :global(line), .labyrinth :global(path) { stroke: currentColor; }
	.theme-toggle { border-radius: 9999px; padding: 0.35rem; transition: background 120ms ease-out; position: relative; }
	.theme-toggle:hover { background: rgba(128,128,128,0.12); }
	:global(.dark) .theme-toggle:hover { background: rgba(255,255,255,0.08); }
	.theme-toggle :global(svg) { position: absolute; top: 50%; left: 50%; translate: -50% -50%; }
</style>
