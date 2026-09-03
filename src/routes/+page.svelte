<script lang="ts">
    import DiscoveryHost from "$lib/components/discovery/DiscoveryHost.svelte";

    let { data } = $props();
</script>

<DiscoveryHost {data} />
