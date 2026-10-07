/* coi-serviceworker — Cross-Origin Isolation via Service Worker
 * Enables SharedArrayBuffer (required by ffmpeg.wasm) on static hosts
 * that cannot set COOP / COEP response headers.
 *
 * Works in dual mode:
 *   - As a <script> tag on the page  → registers the SW, reloads once
 *   - As the service worker itself   → injects COOP/COEP on every response
 */

if (typeof window === 'undefined') {
    /* ── SERVICE WORKER CONTEXT ─────────────────────────────────────────── */
    self.addEventListener('install',  ()      => self.skipWaiting());
    self.addEventListener('activate', event   => event.waitUntil(self.clients.claim()));

    self.addEventListener('message', event => {
        if (event.data === 'skipWaiting') self.skipWaiting();
    });

    self.addEventListener('fetch', function (event) {
        // Skip non-GET or opaque requests that can't be cloned
        if (event.request.cache === 'only-if-cached' &&
            event.request.mode  !== 'same-origin') return;

        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (!response || response.status === 0) return response;

                    const headers = new Headers(response.headers);
                    headers.set('Cross-Origin-Opener-Policy',   'same-origin');
                    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
                    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

                    return new Response(response.body, {
                        status:     response.status,
                        statusText: response.statusText,
                        headers,
                    });
                })
                .catch(err => console.error('[coi-sw] fetch error:', err))
        );
    });

} else {
    /* ── PAGE CONTEXT ───────────────────────────────────────────────────── */
    (() => {
        // Already isolated → nothing to do
        if (self.crossOriginIsolated !== false) return;

        if (!navigator.serviceWorker) {
            console.warn('[coi-sw] Service Workers not supported.');
            return;
        }

        // Register this very file as the service worker
        navigator.serviceWorker
            .register(document.currentScript.src)
            .then(reg => {
                if (reg.installing) {
                    // First install — wait for activation, then reload
                    reg.installing.addEventListener('statechange', e => {
                        if (e.target.state === 'installed') location.reload();
                    });
                } else if (reg.waiting) {
                    // Update waiting — skip waiting then reload
                    reg.waiting.postMessage('skipWaiting');
                    location.reload();
                } else {
                    // SW already active but page isn't isolated → reload
                    if (!self.crossOriginIsolated) location.reload();
                }
            })
            .catch(err => console.error('[coi-sw] Registration failed:', err));
    })();
}
