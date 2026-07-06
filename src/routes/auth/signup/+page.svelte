<script lang="ts">
	import SignupForm from '$lib/components/signup-form.svelte';
	import redthreadSvg from '$lib/assets/redthread.svg?raw';
	import labyrinthSvg from '$lib/assets/labyrinth.svg?raw';
</script>

<svelte:head><title>Create account — TinyOwl</title></svelte:head>

<div class="grid min-h-svh lg:grid-cols-2">
	<div class="flex flex-col gap-4 p-6 md:p-10">
		<div class="flex justify-center gap-2 md:justify-start">
			<a href="/" class="flex items-center gap-2 font-medium no-underline">
				<span class="size-5 shrink-0 inline-block [&>svg]:h-full [&>svg]:w-full text-foreground">
					{@html redthreadSvg}
				</span>
				TinyOwl
			</a>
		</div>
		<div class="flex flex-1 items-center justify-center">
			<div class="w-full max-w-xs">
				<SignupForm />
			</div>
		</div>
	</div>
	<div class="bg-muted relative hidden lg:flex items-center justify-center overflow-hidden">
		<div class="absolute inset-0 flex items-center justify-center opacity-[0.06] dark:opacity-[0.09] pointer-events-none">
			<div class="w-[85%]">{@html labyrinthSvg}</div>
		</div>
	</div>
</div>
