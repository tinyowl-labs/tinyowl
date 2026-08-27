/** SHA-256 hex digest. Uses Web Crypto when available; pure JS otherwise
 *  (needed on non-secure HTTP origins where crypto.subtle is undefined, e.g. Tailscale hostnames). */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (subtle) {
        const hash = await subtle.digest("SHA-256", data);
        return bytesToHex(new Uint8Array(hash));
    }
    const hasher = new Sha256Hasher();
    hasher.update(new Uint8Array(data));
    return hasher.hex();
}

/** Incremental SHA-256 over a blob/file stream (crypto.subtle cannot stream). */
export async function sha256HexStream(
    stream: ReadableStream<Uint8Array>,
): Promise<string> {
    const hasher = new Sha256Hasher();
    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value && value.byteLength > 0) hasher.update(value);
        }
    } finally {
        reader.releaseLock();
    }
    return hasher.hex();
}

function bytesToHex(bytes: Uint8Array): string {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** Block SHA-256 hasher for streaming large files without buffering them. */
export class Sha256Hasher {
    private H = new Uint32Array([
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
        0x1f83d9ab, 0x5be0cd19,
    ]);
    private buf = new Uint8Array(64);
    private bufLen = 0;
    private bytes = 0;
    private done = false;

    update(chunk: Uint8Array): void {
        if (this.done) throw new Error("hasher already finalized");
        let offset = 0;
        this.bytes += chunk.byteLength;
        if (this.bufLen > 0) {
            const take = Math.min(64 - this.bufLen, chunk.byteLength);
            this.buf.set(chunk.subarray(0, take), this.bufLen);
            this.bufLen += take;
            offset = take;
            if (this.bufLen === 64) {
                this.compress(this.buf);
                this.bufLen = 0;
            }
        }
        while (offset + 64 <= chunk.byteLength) {
            this.compress(chunk.subarray(offset, offset + 64));
            offset += 64;
        }
        if (offset < chunk.byteLength) {
            const rest = chunk.subarray(offset);
            this.buf.set(rest);
            this.bufLen = rest.byteLength;
        }
    }

    digest(): Uint8Array {
        if (!this.done) {
            const bitLen = this.bytes * 8;
            const pad = new Uint8Array(64);
            pad[0] = 0x80;
            const padLen = this.bufLen < 56 ? 56 - this.bufLen : 120 - this.bufLen;
            this.update(pad.subarray(0, padLen));
            const lenBlock = new Uint8Array(8);
            const view = new DataView(lenBlock.buffer);
            view.setUint32(0, Math.floor(bitLen / 0x100000000), false);
            view.setUint32(4, bitLen >>> 0, false);
            this.update(lenBlock);
            this.done = true;
        }
        const out = new Uint8Array(32);
        const outView = new DataView(out.buffer);
        for (let i = 0; i < 8; i++) outView.setUint32(i * 4, this.H[i], false);
        return out;
    }

    hex(): string {
        return bytesToHex(this.digest());
    }

    private compress(block: Uint8Array): void {
        const w = new Uint32Array(64);
        const view = new DataView(block.buffer, block.byteOffset, 64);
        for (let j = 0; j < 16; j++) {
            w[j] = view.getUint32(j * 4, false);
        }
        for (let j = 16; j < 64; j++) {
            const s0 =
                rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
            const s1 =
                rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
        }
        let [a, b, c, d, e, f, g, h] = this.H;
        for (let j = 0; j < 64; j++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (S0 + maj) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        this.H[0] = (this.H[0] + a) >>> 0;
        this.H[1] = (this.H[1] + b) >>> 0;
        this.H[2] = (this.H[2] + c) >>> 0;
        this.H[3] = (this.H[3] + d) >>> 0;
        this.H[4] = (this.H[4] + e) >>> 0;
        this.H[5] = (this.H[5] + f) >>> 0;
        this.H[6] = (this.H[6] + g) >>> 0;
        this.H[7] = (this.H[7] + h) >>> 0;
    }
}
