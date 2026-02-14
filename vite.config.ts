import { defineConfig, type Plugin } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import Sitemap from "vite-plugin-sitemap";
import viteCompression from "vite-plugin-compression";

function appendExternalSitemapUrls(urls: { loc: string; changefreq: string; priority: number }[]): Plugin {
  return {
    name: "append-external-sitemap-urls",
    enforce: "post",
    closeBundle: {
      order: "post" as const,
      sequential: true,
      async handler() {
        const sitemapPath = path.resolve(__dirname, "dist/sitemap.xml");
        await new Promise((r) => setTimeout(r, 500));
        if (!fs.existsSync(sitemapPath)) return;

        let xml = fs.readFileSync(sitemapPath, "utf-8");
        const lastmod = new Date().toISOString();
        const seen = new Set<string>();
        xml = xml.replace(/<url>.*?<\/url>/g, (match) => {
          const locMatch = /<loc>(.*?)<\/loc>/.exec(match);
          if (locMatch && seen.has(locMatch[1])) return "";
          if (locMatch) seen.add(locMatch[1]);
          return match;
        });

        const entries = urls
          .map(
            (u) =>
              `<url><loc>${u.loc}</loc><lastmod>${lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
          )
          .join("");

        xml = xml.replace("</urlset>", `${entries}</urlset>`);
        fs.writeFileSync(sitemapPath, xml, "utf-8");
      },
    },
  };
}

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  build: {
    minify: "esbuild",
    target: "es2020",
    sourcemap: false,
    cssCodeSplit: true,
    cssMinify: "esbuild",
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 50,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        compact: true,
        generatedCode: { constBindings: true, arrowFunctions: true, objectShorthand: true, symbols: true },
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/react-dom/")) return "v-react-dom";
          if (id.includes("/react/")) return "v-react";
          if (id.includes("/scheduler/")) return "v-scheduler";
          if (id.includes("/react-router-dom/")) return "v-router-dom";
          if (id.includes("/react-router/")) return "v-router";
          if (id.includes("/@remix-run/")) return "v-remix-run";
          if (id.includes("/@tanstack/query-core")) return "v-query-core";
          if (id.includes("/@tanstack/react-query")) return "v-query-react";
          if (id.includes("/d3-")) {
            const m = id.match(/\/node_modules\/(d3-[^/]+)/);
            if (m) return "v-" + m[1];
          }
          if (id.includes("/recharts/")) return "v-recharts";
          if (id.includes("/victory-vendor/")) return "v-victory";
          if (id.includes("/@radix-ui/")) {
            const m = id.match(/@radix-ui\/(react-[^/]+)/);
            if (m) return "v-rx-" + m[1];
            const p = id.match(/@radix-ui\/(primitive[^/]*)/);
            if (p) return "v-rx-primitive";
            return "v-rx-core";
          }
          if (id.includes("/@fingerprintjs/")) return "v-fingerprint";
          if (id.includes("/three/src/")) {
            const sub = id.match(/\/three\/src\/([^/]+)\//);
            if (sub) return "v-three-" + sub[1].toLowerCase();
            return "v-three-core";
          }
          if (id.includes("/three/")) return "v-three";
          if (id.includes("/posthog-js/")) return "v-posthog";
          if (id.includes("/react-ga4/")) return "v-ga4";
          if (id.includes("/@vercel/analytics")) return "v-vercel-analytics";
          if (id.includes("/react-hook-form/")) return "v-rhf";
          if (id.includes("/@hookform/")) return "v-hookform-resolvers";
          if (id.includes("/zod/")) return "v-zod";
          if (id.includes("/date-fns/")) return "v-date-fns";
          if (id.includes("/react-day-picker/")) return "v-day-picker";
          if (id.includes("/embla-carousel")) return "v-embla";
          if (id.includes("/class-variance-authority/")) return "v-cva";
          if (id.includes("/clsx/")) return "v-clsx";
          if (id.includes("/tailwind-merge/")) return "v-tw-merge";
          if (id.includes("/lucide-react/")) return "v-lucide";
          if (id.includes("/cmdk/")) return "v-cmdk";
          if (id.includes("/sonner/")) return "v-sonner";
          if (id.includes("/vaul/")) return "v-vaul";
          if (id.includes("/next-themes/")) return "v-themes";
          if (id.includes("/input-otp/")) return "v-input-otp";
          if (id.includes("/react-resizable-panels/")) return "v-resizable";
          if (id.includes("/js-cookie/")) return "v-js-cookie";
          const pnpm = id.match(/\.pnpm\/([^@/][^/]*?)@|\.pnpm\/(@[^/]+?\+[^@/]+?)@/);
          if (pnpm) {
            const raw = (pnpm[1] || pnpm[2] || "").replace(/\+/g, "-");
            return "v-" + raw;
          }
          const pkg = id.match(/\/node_modules\/(@[^/]+\/[^/]+|[^/]+)/);
          if (pkg) return "v-" + pkg[1].replace(/[@/]/g, "-").replace(/^-/, "");

          return "v-misc";
        },
      },
    },
  },
  plugins: [
    dyadComponentTagger(),
    react(),
    {
      name: "ensure-dist",
      buildStart() {
        const dist = path.resolve(__dirname, "dist");
        if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true });
      },
    },
    viteCompression({
      algorithm: "brotliCompress",
      ext: ".br",
      threshold: 1024,
    }),
    viteCompression({
      algorithm: "gzip",
      ext: ".gz",
      threshold: 1024,
    }),
    Sitemap({
      hostname: "https://eidwtimes.xyz",
      dynamicRoutes: ["/", "/settings"],
      generateRobotsTxt: false,
      changefreq: "hourly",
      priority: 1.0,
      lastmod: new Date(),
      robots: [{ userAgent: "*", allow: "/" }],
    }),
    appendExternalSitemapUrls([
      { loc: "https://datagram.eidwtimes.xyz/api/seo-security-data", changefreq: "always", priority: 0.9 },
    ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
