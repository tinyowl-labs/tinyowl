/** Map presence avatars in the project header (Google Docs–style). */

import type { PresencePeer } from "$lib/map-presence";

let active = $state(false);
let peers = $state<PresencePeer[]>([]);

export const presenceChrome = {
	get active() {
		return active;
	},
	get peers() {
		return peers;
	},
	publish(next: { peers: PresencePeer[]; active?: boolean }) {
		active = next.active ?? true;
		peers = next.peers;
	},
	clear() {
		active = false;
		peers = [];
	},
};
