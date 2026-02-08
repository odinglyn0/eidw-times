import { defineConfig, type Plugin } from "vite";
import dyadComponentTagger from "@dyad-sh/react-vite-component-tagger";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import Sitemap from "vite-plugin-sitemap";

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
        const locRegex = /<url><loc>(.*?)<\/loc>/g;
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
  plugins: [
    dyadComponentTagger(),
    react(),
    Sitemap({
      hostname: "https://eidwtimes.xyz",
      dynamicRoutes: ["/", "/settings"],
      generateRobotsTxt: false,
      changefreq: "hourly",
      priority: 1.0,
      lastmod: new Date(),
      robots: [
        {
          userAgent: "*",
          allow: "/",
        },
      ],
    }),
    appendExternalSitemapUrls([
      {
        loc: "https://romeo-api-b.eidwtimes.xyz/api/seo-security-data",
        changefreq: "always",
        priority: 0.9,
      },
      {
        loc: "https://eidwtimes.xyz/legal/privacy.docx",
        changefreq: "monthly",
        priority: 0.5,
      },
      {
        loc: "https://eidwtimes.xyz/legal/terms.docx",
        changefreq: "monthly",
        priority: 0.5,
      },
      {
        loc: "https://eidwtimes.xyz/legal/cookies.docx",
        changefreq: "monthly",
        priority: 0.5,
      },
      {
        loc: "https://eidwtimes.xyz/terms",
        changefreq: "monthly",
        priority: 0.5,
      },
      {
        loc: "https://eidwtimes.xyz/privacy",
        changefreq: "monthly",
        priority: 0.5,
      },
      {
        loc: "https://eidwtimes.xyz/cookies",
        changefreq: "monthly",
        priority: 0.5,
      },
    ]),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
