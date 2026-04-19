const CACHE_NAME = "eidw-assets-v2";

const ASSET_EXTENSIONS = /\.(js|css|woff2?|ttf|otf|eot|png|jpe?g|gif|svg|avif|webp|ico|wasm)(\?.*)?$/i;

const NEVER_CACHE = [
  "/api/",
  "/sw.js",
  "datagram.eidwtimes.xyz",
  "smack-stream",
  "bouncetoken",
  "dgrmV2",
  "chrome-extension",
];

function shouldCache(url) {
  for (const pattern of NEVER_CACHE) {
    if (url.includes(pattern)) return false;
  }
  if (url.includes("/assets/") && ASSET_EXTENSIONS.test(url)) return true;
  const path = new URL(url).pathname;
  if (
    path.endsWith(".js") ||
    path.endsWith(".css") ||
    path.endsWith(".woff2") ||
    path.endsWith(".woff") ||
    path.endsWith(".ttf") ||
    path.endsWith(".avif") ||
    path.endsWith(".webp") ||
    path.endsWith(".png") ||
    path.endsWith(".svg") ||
    path.endsWith(".ico")
  ) {
    return true;
  }
  return false;
}

self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names
            .filter(function (name) {
              return name !== CACHE_NAME;
            })
            .map(function (name) {
              return caches.delete(name);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = req.url;
  if (url.startsWith("ws:") || url.startsWith("wss:")) return;
  if (url.includes("smack-stream")) return;
  if (!shouldCache(url)) return;

  event.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (response) {
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }
        var clone = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, clone);
        });
        return response;
      });
    })
  );
});
