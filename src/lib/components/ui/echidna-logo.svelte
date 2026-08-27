<script lang="ts">
    import echidnaIconSvg from "$lib/assets/echidna-icon.svg?raw";
    import echidnaLockupSvg from "$lib/assets/echidna.svg?raw";
    import { isDark } from "$lib/stores/theme.svelte";

    let {
        lockup = false,
    }: {
        /** When true, use the full wordmark lockup instead of the icon. */
        lockup?: boolean;
    } = $props();

    const dark = $derived(isDark());
    const source = $derived(lockup ? echidnaLockupSvg : echidnaIconSvg);
    const themed = $derived(
        dark
            ? source
                  .replace(/fill="#000000"/gi, 'fill="currentColor"')
                  .replace(/stroke="#000000"/gi, 'stroke="currentColor"')
                  .replace(/fill="#ffffff"/gi, 'fill="#000000"')
                  .replace(/stroke="#ffffff"/gi, 'stroke="#000000"')
                  .replace(/fill:#000000/gi, "fill:currentColor")
                  .replace(/stroke:#000000/gi, "stroke:currentColor")
                  .replace(/fill:#ffffff/gi, "fill:#000000")
                  .replace(/stroke:#ffffff/gi, "stroke:#000000")
            : source,
    );
</script>

{#key `${dark}-${lockup}`}
    {@html themed}
{/key}
