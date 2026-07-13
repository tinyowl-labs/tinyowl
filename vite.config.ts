import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
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
      compilerOptions: {
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
      adapter: adapter({ fallback: "index.html" }),
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
      "/api/v1": "http://localhost:8080",
    },
  },
});
