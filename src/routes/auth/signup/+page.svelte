<script lang="ts">
	import AuthShell from "$lib/components/AuthShell.svelte";
	import SignupForm from "$lib/components/signup-form.svelte";
</script>

<svelte:head><title>Create account — echidna</title></svelte:head>

<AuthShell>
	<SignupForm />
</AuthShell>
