import { type Plugin, loadEnv } from "vite";
import crypto from "crypto";

const API_ROUTES = [
  "/api/security-data",
  "/api/departure-data",
  "/api/hourly-interval-security-data",
  "/api/hourly-interval-departure-data",
  "/api/feature-requests",
  "/api/acknowledged-feature-requests",
  "/api/active-announcements",
  "/api/range-security-data",
  "/api/irish-time",
  "/api/last-departures",
  "/api/facility-hours",
  "/api/simulate/trition/method-b",
  "/api/simulate/liminal/method-b",
  "/api/simulate/trition/method-d",
  "/api/simulate/liminal/method-d",
  "/api/simulate/trition/method-a",
  "/api/simulate/liminal/method-a",
  "/api/simulate/trition/method-c",
  "/api/simulate/liminal/method-c",
  "/api/range-departure-data",
  "/api/recommendation",
  "/api/processed-security-data",
  "/api/processed-departure-data",
  "/api/chart-data",
  "/api/hourly-detail-stats",
  "/api/projected-hourly-stats",
];

const UNPROTECTED_ROUTES = [
  "/api/bouncetoken/verify",
  "/api/seo-security-data",
  "/api/current-security-data",
];

function hmacSha512(key: string, data: string): string {
  return crypto.createHmac("sha512", key).update(data).digest("hex");
}

function sha512(data: string): string {
  return crypto.createHash("sha512").update(data).digest("hex");
}

export default function datagramMintPlugin(): Plugin {
  let DATAGRAM_KEY = "dgrm-default-dev-key-change-me";
  // change to datagram once its propogated
  const DATAGRAM_HOST = "romeo-api-b.eidwtimes.xyz";

  return {
    name: "datagram-mint",
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), '');
      if (env.DATAGRAM_SIGNING_KEY) {
        DATAGRAM_KEY = env.DATAGRAM_SIGNING_KEY;
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== "/dgrmV2-fp" || req.method !== "POST") return next();

        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", () => {
          try {
            const { fp } = JSON.parse(body);
            if (!fp || typeof fp !== "string") {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "missing fp" }));
              return;
            }

            const fpHmacPrefix = hmacSha512(DATAGRAM_KEY, fp).slice(0, 16);
            const routeKey = sha512(fp);
            const exp = Math.floor(Date.now() / 1000) + 86400;
            const COOKIE_PREFIXES = [
              "_ga_", "_gid_", "__ut", "_fbp_", "_dc_", "mp_", "ajs_", "_hp2_",
              "__hs", "_ce_", "_pk_", "ss_c", "ln_o", "_tt_", "ab_t", "ck_v",
            ];

            const allRoutes = [...API_ROUTES, ...UNPROTECTED_ROUTES];
            const routes: Record<string, { path: string; cookieName: string; cookieValue: string; hsKey: string }> = {};

            for (let i = 0; i < allRoutes.length; i++) {
              const route = allRoutes[i];
              const hashedPath = hmacSha512(routeKey, route).slice(0, 24);
              const perRouteHsKey = hmacSha512(DATAGRAM_KEY, routeKey + "|" + route);
              const signPayload = `${DATAGRAM_HOST}/${fpHmacPrefix}/${hashedPath}|${exp}`;
              const cookieValue = hmacSha512(perRouteHsKey, signPayload);
              const prefixIdx = (i + parseInt(hashedPath.slice(0, 2), 16)) % COOKIE_PREFIXES.length;
              const cookieName = COOKIE_PREFIXES[prefixIdx] + hashedPath.slice(0, 6);

              routes[route] = {
                path: hashedPath,
                cookieName,
                cookieValue,
                hsKey: perRouteHsKey.slice(0, 32),
              };
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              host: DATAGRAM_HOST,
              fpPrefix: fpHmacPrefix,
              routes,
              exp,
              routeKey: routeKey.slice(0, 32),
            }));
          } catch (e) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "internal" }));
          }
        });
      });
    },
  };
}
