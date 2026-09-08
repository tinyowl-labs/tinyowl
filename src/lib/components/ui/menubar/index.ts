import { Menubar as MenubarPrimitive } from "bits-ui";
import Content from "./menubar-content.svelte";
import Item from "./menubar-item.svelte";
import Separator from "./menubar-separator.svelte";
import Trigger from "./menubar-trigger.svelte";

const Root = MenubarPrimitive.Root;
const Menu = MenubarPrimitive.Menu;
const Portal = MenubarPrimitive.Portal;

export {
	Root,
	Menu,
	Trigger,
	Content,
	Item,
	Separator,
	Portal,
	Root as Menubar,
	Menu as MenubarMenu,
	Trigger as MenubarTrigger,
	Content as MenubarContent,
	Item as MenubarItem,
	Separator as MenubarSeparator,
};
