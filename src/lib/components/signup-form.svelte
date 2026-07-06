<script lang="ts">
	import { goto } from '$app/navigation';
	import { createClient } from '$lib/supabase/client';
	import { FieldGroup, Field, FieldLabel, FieldDescription } from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let firstName = $state('');
	let lastName = $state('');
	let email = $state('');
	let password = $state('');
	let loading = $state(false);
	let error = $state('');
	let success = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		loading = true; error = ''; success = '';
		if (!firstName || !lastName || !email || !password) {
			error = 'All fields are required.'; loading = false; return;
		}
		const supabase = createClient();
		const { data, error: err } = await supabase.auth.signUp({
			email, password,
			options: { data: { first_name: firstName, last_name: lastName } }
		});
		if (err) { error = err.message; loading = false; return; }
		if (data.session) { await goto('/profile'); return; }
		success = 'Account created. Check your email to confirm.'; loading = false;
	}
</script>

<form onsubmit={handleSubmit} class="flex flex-col gap-6">
	<FieldGroup>
		<div class="flex flex-col items-center gap-1 text-center">
			<h1 class="text-2xl font-bold">Create an account</h1>
			<p class="text-muted-foreground text-sm text-balance">Enter your information to get started</p>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<Field>
				<FieldLabel for="first-name">First name</FieldLabel>
				<Input id="first-name" type="text" bind:value={firstName} required />
			</Field>
			<Field>
				<FieldLabel for="last-name">Last name</FieldLabel>
				<Input id="last-name" type="text" bind:value={lastName} required />
			</Field>
		</div>
		<Field>
			<FieldLabel for="signup-email">Email</FieldLabel>
			<Input id="signup-email" type="email" bind:value={email} placeholder="m@example.com" required />
		</Field>
		<Field>
			<FieldLabel for="signup-password">Password</FieldLabel>
			<Input id="signup-password" type="password" bind:value={password} required />
		</Field>
		{#if error}<p class="text-sm text-destructive">{error}</p>{/if}
		{#if success}<p class="text-sm text-muted-foreground">{success}</p>{/if}
		<Field>
			<Button type="submit" disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</Button>
		</Field>
		<FieldDescription class="text-center">
			Already have an account?
			<a href="/auth/login" class="underline underline-offset-4">Sign in</a>
		</FieldDescription>
	</FieldGroup>
</form>
