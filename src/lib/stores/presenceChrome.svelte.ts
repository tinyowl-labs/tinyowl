/** Map presence avatars in the project header (Google Docs–style). */

import type { PresencePeer } from "$lib/map-presence";

type PresenceChrome = {
	active: boolean;
	peers: PresencePeer[];
	hidden: boolean;
	onToggleHidden: (() => void) | null;
};

let active = $state(false);
let peers = $state<PresencePeer[]>([]);
let hidden = $state(false);
let onToggleHidden = $state<(() => void) | null>(null);

export const presenceChrome = {
	get active() {
		return active;
	},
	get peers() {
		return peers;
	},
	get hidden() {
		return hidden;
	},
	get onToggleHidden() {
		return onToggleHidden;
	},
	publish(next: Omit<PresenceChrome, "active"> & { active?: boolean }) {
		active = next.active ?? true;
		peers = next.peers;
		hidden = next.hidden;
		onToggleHidden = next.onToggleHidden;
	},
	clear() {
		active = false;
		peers = [];
		hidden = false;
		onToggleHidden = null;
	},
};
