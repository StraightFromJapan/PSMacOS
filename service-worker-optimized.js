/**
 * Optimized Service Worker for Psychological Studio
 * Enhanced caching strategies, lazy loading, and offline support
 */

const CACHE_VERSION = 'v3.0';
const CACHE_STATIC = `psychological-studio-static-${CACHE_VERSION}`;
const CACHE_DYNAMIC = `psychological-studio-dynamic-${CACHE_VERSION}`;
const CACHE_AUDIO = `psychological-studio-audio-${CACHE_VERSION}`;
const CACHE_IMAGES = `psychological-studio-images-${CACHE_VERSION}`;

// Core files - cache immediately
const CORE_FILES = [
    './',
    './PsychologicalStudio.html',
    './PsychologicalStudio/style.css',
    './PsychologicalStudio/performance-optimizations.css',
    './PsychologicalStudio/script.js',
    './PsychologicalStudio/performance-utils.js',
    './PsychologicalStudio/audio-worker.js',
    './manifest.json',
    './icon.png'
];

// Audio files - cache on demand
const AUDIO_PRIORITY_HIGH = [
    // Most frequently used samples
    './mykicks/1.wav',
    './mykicks/2.wav',
    './Techno/1.wav',
    './Techno/2.wav'
];

// Install event - cache core files immediately
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        Promise.all([
            // Cache core files
            caches.open(CACHE_STATIC).then((cache) => {
                console.log('[SW] Caching core files');
                return cache.addAll(CORE_FILES.map(url => new Request(url, { cache: 'reload' })));
            }),
            // Pre-cache high-priority audio
            caches.open(CACHE_AUDIO).then((cache) => {
                console.log('[SW] Pre-caching high-priority audio');
                return Promise.allSettled(
                    AUDIO_PRIORITY_HIGH.map(url =>
                        fetch(url).then(response => cache.put(url, response))
                            .catch(err => console.log(`[SW] Failed to cache ${url}:`, err))
                    )
                );
            })
        ]).then(() => {
            console.log('[SW] Installation complete');
            return self.skipWaiting();
        })
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        Promise.all([
            // Clean old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName.includes('psychological-studio') && 
                            !cacheName.includes(CACHE_VERSION)) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control immediately
            self.clients.claim()
        ]).then(() => {
            console.log('[SW] Activation complete');
        })
    );
});

// Fetch event - intelligent caching strategies
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip non-HTTP(S) requests
    if (!url.protocol.startsWith('http')) return;

    // Choose strategy based on resource type
    event.respondWith(handleFetch(request, url));
});

async function handleFetch(request, url) {
    const pathname = url.pathname;

    try {
        // Strategy 1: Network First (for HTML - always fresh)
        if (pathname.endsWith('.html') || pathname === '/' || pathname === './') {
            return await networkFirst(request);
        }

        // Strategy 2: Cache First (for static assets)
        if (pathname.match(/\.(css|js|json)$/)) {
            return await cacheFirst(request, CACHE_STATIC);
        }

        // Strategy 3: Cache First with Background Update (for audio)
        if (pathname.match(/\.(wav|mp3|ogg|m4a)$/)) {
            return await cacheFirstBackgroundUpdate(request, CACHE_AUDIO);
        }

        // Strategy 4: Cache First (for images)
        if (pathname.match(/\.(jpg|jpeg|png|gif|svg|ico|webp)$/)) {
            return await cacheFirst(request, CACHE_IMAGES);
        }

        // Strategy 5: Network First with Cache Fallback (default)
        return await networkFirst(request);

    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        return await offlineFallback(request);
    }
}

// Caching Strategy 1: Network First
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_DYNAMIC);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        throw error;
    }
}

// Caching Strategy 2: Cache First
async function cacheFirst(request, cacheName) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        throw error;
    }
}

// Caching Strategy 3: Cache First with Background Update
async function cacheFirstBackgroundUpdate(request, cacheName) {
    const cachedResponse = await caches.match(request);
    
    // Background fetch to update cache
    const fetchPromise = fetch(request).then((response) => {
        if (response.ok) {
            caches.open(cacheName).then((cache) => {
                cache.put(request, response.clone());
            });
        }
        return response;
    }).catch((err) => {
        console.log('[SW] Background update failed:', err);
    });

    // Return cached response immediately if available
    if (cachedResponse) {
        return cachedResponse;
    }

    // Otherwise wait for network
    return fetchPromise;
}

// Offline fallback
async function offlineFallback(request) {
    const url = new URL(request.url);
    
    // Try to find any cached version
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    // Return appropriate offline response based on resource type
    if (request.destination === 'document' || url.pathname.endsWith('.html')) {
        return new Response(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Offline - Psychological Studio</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background: linear-gradient(135deg, #1a1a2e 0%, #2a1a3e 100%);
                        color: #f0f0f0;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        text-align: center;
                        padding: 20px;
                    }
                    .offline-container {
                        max-width: 500px;
                        padding: 40px;
                        background: rgba(255, 255, 255, 0.05);
                        border-radius: 12px;
                        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    }
                    h1 {
                        color: #717d9f;
                        margin-bottom: 20px;
                        font-size: 2em;
                    }
                    p {
                        line-height: 1.6;
                        margin-bottom: 15px;
                    }
                    button {
                        background: #717d9f;
                        color: white;
                        border: none;
                        padding: 12px 30px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 16px;
                        margin-top: 20px;
                        transition: background 0.3s;
                    }
                    button:hover {
                        background: #5a6580;
                    }
                    .pulse {
                        animation: pulse 2s infinite;
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.5; }
                    }
                </style>
            </head>
            <body>
                <div class="offline-container">
                    <h1 class="pulse">🎵 Psychological Studio</h1>
                    <p>You're currently offline</p>
                    <p>This content is not available in your offline cache. Please check your internet connection and try again.</p>
                    <button onclick="window.location.reload()">Retry</button>
                </div>
            </body>
            </html>
        `, {
            headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-store'
            }
        });
    }

    // For audio files
    if (url.pathname.match(/\.(wav|mp3|ogg|m4a)$/)) {
        return new Response('', {
            status: 404,
            statusText: 'Audio file not available offline'
        });
    }

    // Generic 404
    return new Response('Resource not available offline', {
        status: 404,
        statusText: 'Not Found Offline'
    });
}

// Background sync
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'sync-audio-cache') {
        event.waitUntil(syncAudioCache());
    }
});

async function syncAudioCache() {
    console.log('[SW] Syncing audio cache...');
    // Implement audio cache synchronization logic here
}

// Push notifications (optional)
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'New update available',
        icon: '/icon.png',
        badge: '/icon.png',
        vibrate: [200, 100, 200]
    };

    event.waitUntil(
        self.registration.showNotification('Psychological Studio', options)
    );
});

// Message handling
self.addEventListener('message', (event) => {
    const { type, data } = event.data;

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CACHE_AUDIO_SAMPLE':
            cacheAudioSample(data.url);
            break;

        case 'CLEAR_CACHE':
            clearAllCaches();
            break;

        case 'GET_CACHE_SIZE':
            getCacheSize().then(size => {
                event.ports[0].postMessage({ size });
            });
            break;

        default:
            console.log('[SW] Unknown message type:', type);
    }
});

async function cacheAudioSample(url) {
    try {
        const cache = await caches.open(CACHE_AUDIO);
        const response = await fetch(url);
        if (response.ok) {
            await cache.put(url, response);
            console.log('[SW] Cached audio sample:', url);
        }
    } catch (error) {
        console.error('[SW] Failed to cache audio sample:', error);
    }
}

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('[SW] All caches cleared');
}

async function getCacheSize() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        return {
            usage: estimate.usage,
            quota: estimate.quota,
            percentage: (estimate.usage / estimate.quota) * 100
        };
    }
    return null;
}

// Periodic cache cleanup (run on activate)
async function cleanupOldCacheEntries() {
    const cacheNames = [CACHE_DYNAMIC, CACHE_AUDIO, CACHE_IMAGES];
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    const now = Date.now();

    for (const cacheName of cacheNames) {
        try {
            const cache = await caches.open(cacheName);
            const requests = await cache.keys();

            for (const request of requests) {
                const response = await cache.match(request);
                if (response) {
                    const dateHeader = response.headers.get('date');
                    if (dateHeader) {
                        const date = new Date(dateHeader);
                        if (now - date.getTime() > maxAge) {
                            await cache.delete(request);
                            console.log('[SW] Deleted old cache entry:', request.url);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[SW] Cache cleanup error:', error);
        }
    }
}

console.log('[SW] Service worker loaded');
