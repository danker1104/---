// 보수적인 Service Worker + 오프라인 폴백.
// 인증(iron-session)·서버 액션·동적 데이터의 정합성을 지키기 위해
// HTML·동적 요청은 캐싱하지 않고 항상 네트워크를 우선한다.
// 다만 네트워크가 끊긴 경우에 한해 미리 캐싱한 오프라인 안내 페이지를 보여주고,
// 해시가 박힌 불변 빌드 자산(_next/static)과 정적 아이콘/매니페스트는 캐싱한다.
const STATIC_CACHE = "yaja-static-v2";
const ASSET_CACHE = "yaja-assets-v2";
const KEEP_CACHES = [STATIC_CACHE, ASSET_CACHE];
const OFFLINE_URL = "/offline.html";

const STATIC_ASSETS = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // 개별 캐싱: 일부 자산이 없어도 나머지(특히 오프라인 페이지)는 캐싱되도록 한다.
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)))),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !KEEP_CACHES.includes(key)).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // GET 이외(POST 등 서버 액션 포함)는 절대 가로채지 않는다.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // 다른 오리진 요청은 개입하지 않는다.
  if (url.origin !== self.location.origin) return;

  // 1) 페이지 이동(navigation): 네트워크 우선. 오프라인일 때만 오프라인 안내 페이지로 폴백한다.
  //    (인증·최신 데이터 보호를 위해 HTML 자체는 캐싱하지 않는다.)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  // 2) 해시가 박힌 빌드 자산(_next/static)은 불변이므로 cache-first.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  // 3) 정적 아이콘/매니페스트도 cache-first.
  const isStaticAsset =
    url.pathname.startsWith("/icons/") || url.pathname === "/manifest.webmanifest";
  if (isStaticAsset) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // 그 외(데이터·인증 등)는 개입하지 않아 항상 최신을 받는다.
});

function cacheFirst(request, cacheName) {
  return caches.match(request).then((cached) => {
    if (cached) return cached;
    return fetch(request).then((response) => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(cacheName).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    });
  });
}
