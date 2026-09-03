import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { gzip } from "node:zlib";
import type { IncomingMessage, ServerResponse } from "node:http";
import tailwindcss from "@tailwindcss/vite";
import adapterNode from "@sveltejs/adapter-node";
import adapterStatic from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const useNodeAdapter = process.env.TINYOWL_ADAPTER === "node";
const kitAdapter = useNodeAdapter
  ? adapterNode({ out: "build" })
  : adapterStatic({ fallback: "index.html" });
const cesiumBuildRoot = path.resolve(
  projectRoot,
  "node_modules/cesium/Build/Cesium",
);
const cesiumTargetRoot = path.resolve(projectRoot, "static/cesium");
const cesiumFolders = ["Assets", "ThirdParty", "Workers", "Widgets"];
const cesiumFiles = ["Cesium.js"];
/** OSM basemap; no Viewer chrome; skyBox off. IAU2006_XYS stays — globe ICRF fetch. */
const cesiumSkip = [
  `${path.sep}NaturalEarthII`,
  `${path.sep}SkyBox`,
  `${path.sep}LensFlare`,
  `${path.sep}Widgets${path.sep}Images`,
];
const gzipAsync = promisify(gzip);
let cesiumCopyInFlight: Promise<void> | null = null;

function shouldCopyCesiumPath(src: string): boolean {
  return !cesiumSkip.some((seg) => src.includes(seg));
}

async function gzipCesiumJs() {
  const jsPath = path.join(cesiumTargetRoot, "Cesium.js");
  const gzPath = `${jsPath}.gz`;
  const buf = await fs.readFile(jsPath);
  await fs.writeFile(gzPath, await gzipAsync(buf, { level: 9 }));
}

function cesiumJsGzipMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) {
  const url = req.url?.split("?")[0] ?? "";
  if (url !== "/cesium/Cesium.js") {
    next();
    return;
  }
  const accept = req.headers["accept-encoding"] ?? "";
  if (!String(accept).includes("gzip")) {
    next();
    return;
  }
  const gzPath = path.join(cesiumTargetRoot, "Cesium.js.gz");
  void fs.stat(gzPath).then(
    (st) => {
      res.setHeader("Content-Type", "text/javascript; charset=utf-8");
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Content-Length", String(st.size));
      res.setHeader("Vary", "Accept-Encoding");
      createReadStream(gzPath).pipe(res);
    },
    () => next(),
  );
}

async function copyCesiumAssets() {
  if (cesiumCopyInFlight) return cesiumCopyInFlight;
  cesiumCopyInFlight = (async () => {
    await fs.mkdir(cesiumTargetRoot, { recursive: true });
    await Promise.all([
      ...cesiumFolders.map((folder) =>
        fs.cp(
          path.join(cesiumBuildRoot, folder),
          path.join(cesiumTargetRoot, folder),
          {
            recursive: true,
            force: true,
            filter: shouldCopyCesiumPath,
          },
        ),
      ),
      ...cesiumFiles.map((file) =>
        fs.cp(
          path.join(cesiumBuildRoot, file),
          path.join(cesiumTargetRoot, file),
          { force: true },
        ),
      ),
    ]);
    await Promise.all(
      [
        "Assets/Textures/NaturalEarthII",
        "Assets/Textures/SkyBox",
        "Assets/Textures/LensFlare",
        "Widgets/Images",
      ].map((rel) =>
        fs.rm(path.join(cesiumTargetRoot, rel), {
          recursive: true,
          force: true,
        }),
      ),
    );
    await gzipCesiumJs();
  })();
  try {
    await cesiumCopyInFlight;
  } finally {
    cesiumCopyInFlight = null;
  }
}

function ensureCesiumAssetsPlugin() {
  return {
    name: "ensure-cesium-assets",
    async buildStart() {
      await copyCesiumAssets();
    },
    configureServer(server: {
      config: { logger: { error: (message: string) => void } };
      middlewares: { use: (fn: typeof cesiumJsGzipMiddleware) => void };
    }) {
      server.middlewares.use(cesiumJsGzipMiddleware);
      void copyCesiumAssets().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        server.config.logger.error(`Failed to copy Cesium assets: ${message}`);
      });
    },
    configurePreviewServer(server: {
      middlewares: { use: (fn: typeof cesiumJsGzipMiddleware) => void };
    }) {
      server.middlewares.use(cesiumJsGzipMiddleware);
    },
  };
}

export default defineConfig({
  plugins: [
    ensureCesiumAssetsPlugin(),
    tailwindcss(),
    sveltekit({
      adapter: kitAdapter,
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
    }),
  ],
  define: {
    CESIUM_BASE_URL: JSON.stringify("/cesium/"),
  },
  worker: {
    format: "es",
  },
  // Cesium is loaded as a browser global from /static/cesium — keep it out of
  // Vite's dep optimizer (prebundled cesium can break WebGL / texture atlas).
  // Combined `cesium` IIFE stays out of the optimizer (prebundle broke WebGL/atlas).
  // `@cesium/engine` MUST be optimized: its CJS deps (mersenne-twister, …) have no
  // default ESM export, so native exclude-mode imports fail in Vite dev.
  ssr: {
    external: ["cesium", "@cesium/engine"],
  },
  optimizeDeps: {
    exclude: ["cesium"],
    include: ["@cesium/engine"],
  },
  server: {
    host: true,
    // Allow Tailscale MagicDNS / Funnel hosts (leading-dot match is flaky across Vite versions).
    allowedHosts: true,
    proxy: {
      "/media": "http://localhost:8080",
      // Long timeout: large media uploads and reverse-image CLIP embeds.
      "/api/v1": {
        target: "http://localhost:8080",
        timeout: 3_600_000,
        proxyTimeout: 3_600_000,
      },
      // Same-origin Supabase for Tailscale Funnel demos (browser never hits :54321).
      "/auth/v1": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
      },
      "/rest/v1": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
      },
      "/storage/v1": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
      },
      "/realtime/v1": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: true,
    // Tailscale Funnel / MagicDNS
    allowedHosts: true,
    proxy: {
      "/media": "http://localhost:8080",
      "/api/v1": {
        target: "http://localhost:8080",
        timeout: 3_600_000,
        proxyTimeout: 3_600_000,
      },
      "/auth/v1": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
      },
      "/rest/v1": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
      },
      "/storage/v1": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
      },
      "/realtime/v1": {
        target: "http://127.0.0.1:54321",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
