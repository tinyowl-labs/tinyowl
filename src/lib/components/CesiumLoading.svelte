<script lang="ts">
    type Props = {
        class?: string;
    };

    let { class: klass = "" }: Props = $props();
</script>

<div
    class="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-background/60 backdrop-blur-[1.5px] {klass}"
    role="status"
    aria-label="Preparing map"
>
    <img
        src="/brand/cesium-icon.svg"
        alt=""
        width="44"
        height="44"
        class="size-11 drop-shadow-sm animate-[cesium-load_1.4s_ease-in-out_infinite]"
        draggable="false"
    />
</div>

<style>
    @keyframes cesium-load {
        0%,
        100% {
            opacity: 0.55;
            transform: scale(0.94);
        }
        50% {
            opacity: 1;
            transform: scale(1);
        }
    }
</style>
