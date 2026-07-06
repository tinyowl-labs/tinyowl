<script
	lang="ts"
	generics="TData, TValue, TContext extends HeaderContext<TData, TValue> | CellContext<TData, TValue>"
>
	import type {
		CellContext,
		ColumnDefTemplate,
		HeaderContext,
	} from "@tanstack/table-core";
	import {
		RenderComponentConfig,
		RenderSnippetConfig,
	} from "./render-helpers.js";

	type Props = {
		content?:
			| ColumnDefTemplate<HeaderContext<TData, TValue>>
			| ColumnDefTemplate<CellContext<TData, TValue>>;
		context: TContext;
	};

	let { content, context }: Props = $props();
</script>

{#if typeof content === "string"}
	{content}
{:else if content instanceof Function}
	{@const result = content(context as never)}
	{#if result instanceof RenderComponentConfig}
		{@const { component: Component, props } = result}
		<Component {...props} />
	{:else if result instanceof RenderSnippetConfig}
		{@const { snippet, params } = result}
		{@render snippet(params)}
	{:else}
		{result}
	{/if}
{/if}
