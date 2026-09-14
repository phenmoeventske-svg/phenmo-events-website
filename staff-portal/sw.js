const CACHE_NAME = 'phenmo-staff-app-v1';

const PRECACHE_ASSETS = [
    '/staff-portal/',
    '/staff-portal/index.html',
    '/staff-portal/dashboard.html',
    '/staff-portal/plan.html',
    '/staff-portal/inventory.html',
    '/staff-portal/styles.css',
    '/staff-portal/inventory-data.js',
    '/staff-portal/app.js',
    '/staff-portal/manifest.json',
    '/staff-portal/icon.svg',
    '/phenmo-logo.jpg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('[SW] Precache asset fetch failure:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests (e.g. POST, PUT, DELETE to API)
    if (request.method !== 'GET') {
        return;
    }

    // Handle /api/... routes: Network first, fallback to cached or offline JSON
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    return networkResponse;
                })
                .catch(() => {
                    // Offline fallback for API
                    return new Response(
                        JSON.stringify({ offline: true, error: 'Device offline. Working in cached mode.' }),
                        {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                })
        );
        return;
    }

    // Static assets & HTML: Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => cachedResponse);

            return cachedResponse || fetchPromise;
        })
    );
});

