<script lang="ts">
	import AuthShell from "$lib/components/AuthShell.svelte";
	import LoginForm from "$lib/components/login-form.svelte";
</script>

<svelte:head><title>Sign in — echidna</title></svelte:head>

<AuthShell>
	<LoginForm />
</AuthShell>
