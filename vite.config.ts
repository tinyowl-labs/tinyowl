import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
let cesiumCopyInFlight: Promise<void> | null = null;

async function copyCesiumAssets() {
  if (cesiumCopyInFlight) return cesiumCopyInFlight;
  cesiumCopyInFlight = (async () => {
    await fs.mkdir(cesiumTargetRoot, { recursive: true });
    await Promise.all([
      ...cesiumFolders.map((folder) =>
        fs.cp(
          path.join(cesiumBuildRoot, folder),
          path.join(cesiumTargetRoot, folder),
          { recursive: true, force: true },
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
    }) {
      void copyCesiumAssets().catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        server.config.logger.error(`Failed to copy Cesium assets: ${message}`);
      });
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
  // Cesium is loaded as a browser global from /static/cesium — keep it out of SSR.
  ssr: {
    external: ["cesium"],
  },
  optimizeDeps: {
    exclude: ["cesium"],
  },
  server: {
    host: true,
    proxy: {
      "/media": "http://localhost:8080",
      // Long timeout: reverse-image POST embeds via OpenCLIP / embed-worker.
      "/api/v1": {
        target: "http://localhost:8080",
        timeout: 120_000,
        proxyTimeout: 120_000,
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
    // Tailscale Funnel serves https://<machine>.<tailnet>.ts.net
    allowedHosts: [".ts.net"],
    proxy: {
      "/media": "http://localhost:8080",
      "/api/v1": {
        target: "http://localhost:8080",
        timeout: 120_000,
        proxyTimeout: 120_000,
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
