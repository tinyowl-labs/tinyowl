<script lang="ts">
    import SchemaField from "$lib/components/dashboard/SchemaField.svelte";
    import type { LookupOpt } from "$lib/project/schemaFields";

    type Props = {
        value?: string;
        options?: LookupOpt[];
        onCommit?: (value: string) => void;
        onCancel?: () => void;
    };

    let { value = "", options, onCommit, onCancel }: Props = $props();
</script>

<SchemaField
    {value}
    {options}
    compact
    onCommit={(v) => onCommit?.(v)}
    onCancel={onCancel}
/>
