/** One viewport chrome menu at a time (scene menubar, rail flyout, context, comments, infobox). */
const SCENE_PREFIX = "scene:";

class ViewportMenu {
    id = $state(null as string | null);

    claim(id: string) {
        this.id = id;
    }

    release(id?: string) {
        if (!id || this.id === id) this.id = null;
    }

    releasePrefix(prefix: string) {
        if (this.id?.startsWith(prefix)) this.id = null;
    }

    is(id: string) {
        return this.id === id;
    }

    /** Open scene-menubar menu value, or "" when another chrome owns the slot. */
    sceneValue() {
        return this.id?.startsWith(SCENE_PREFIX)
            ? this.id.slice(SCENE_PREFIX.length)
            : "";
    }
}

export const viewportMenu = new ViewportMenu();
