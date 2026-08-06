import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile, writeFile } from "node:fs/promises";

function pwaPrecachePlugin(): Plugin {
  return {
    name: "vinaris-pwa-precache",
    apply: "build",
    enforce: "post",
    async closeBundle() {
      const serviceWorkerUrl = new URL("./dist/sw.js", import.meta.url);
      const html = await readFile(new URL("./dist/index.html", import.meta.url), "utf8");
      const entryAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)]
        .map((match) => match[1])
        .filter((assetPath, index, paths) => paths.indexOf(assetPath) === index)
        .sort();
      const entryHash = entryAssets.join("-").replace(/[^a-zA-Z0-9]/g, "").slice(-24) || "development";
      const source = await readFile(serviceWorkerUrl, "utf8");
      const generatedSource = source
        .replace("__VINARIS_CACHE_NAME__", `winecellarmulti-shell-${entryHash}`)
        .replace("__VINARIS_PRECACHE_URLS__", JSON.stringify([
          "/",
          "/manifest.webmanifest",
          "/icons/icon-192.png",
          "/icons/icon-512.png",
          "/icons/maskable-512.png",
          "/icons/logo.png",
          "/landing/demo-dashboard-desktop.webp",
          "/landing/demo-dashboard-mobile.webp",
          ...entryAssets,
        ]));
      await writeFile(serviceWorkerUrl, generatedSource, "utf8");
    },
  };
}

export default defineConfig({
  plugins: [react(), pwaPrecachePlugin()],
  build: {
    rolldownOptions: {
      output: {
        strictExecutionOrder: true,
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: "icons-vendor",
              test: /node_modules[\\/]@phosphor-icons[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000"
    }
  },
  preview: {
    allowedHosts: [
      "vinaris.app",
      "www.vinaris.app",
      "vinaris.duckdns.org",
      "winecellarmulti.duckdns.org"
    ]
  }
});
