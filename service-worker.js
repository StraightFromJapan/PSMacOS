const CACHE_NAME = 'psychological-studio-v2';
const STATIC_CACHE = 'psychological-studio-static-v2';
const DYNAMIC_CACHE = 'psychological-studio-dynamic-v2';
const AUDIO_CACHE = 'psychological-studio-audio-v2';

// Core app files that must be cached
const CORE_FILES = [
    './',
    './PsychologicalStudio.html',
    './NewRelease/style.css',
    './PsychologicalStudio/style.css',
    './NewRelease/script.js',
    './PsychologicalStudio/script.js',
    './security.min.js',
    './manifest.json',
    './icon.png',
    './icon3.png',
    './icon4.png',
    './favicon.ico',
    './favicon-16x16.png',
    './favicon-32x32.png'
];

// Audio samples and media files - comprehensive list
const AUDIO_FILES = [
    // Mykicks samples
    './mykicks/1.wav', './mykicks/2.wav', './mykicks/3.wav', './mykicks/4.wav', './mykicks/5.wav',
    './mykicks/6.wav', './mykicks/7.wav', './mykicks/8.wav', './mykicks/9.wav', './mykicks/10.wav',
    './mykicks/11.wav', './mykicks/12.wav', './mykicks/13.wav', './mykicks/14.wav', './mykicks/15.wav',
    './mykicks/16.wav', './mykicks/17.wav', './mykicks/18.wav', './mykicks/19.wav', './mykicks/20.wav',
    './mykicks/21.wav', './mykicks/22.wav', './mykicks/23.wav', './mykicks/24.wav', './mykicks/25.wav',
    './mykicks/26.wav', './mykicks/27.wav', './mykicks/28.wav', './mykicks/29.wav', './mykicks/30.wav',
    './mykicks/71.wav', './mykicks/81.wav',
    
    // Techno samples
    './Techno/1.wav', './Techno/2.wav', './Techno/3.wav', './Techno/4.wav', './Techno/5.wav',
    './Techno/6.wav', './Techno/7.wav', './Techno/8.wav', './Techno/9.wav', './Techno/10.wav',
    './Techno/11.wav', './Techno/12.wav', './Techno/13.wav', './Techno/14.wav', './Techno/15.wav',
    './Techno/16.wav', './Techno/17.wav', './Techno/18.wav', './Techno/19.wav', './Techno/20.wav',
    './Techno/21.wav', './Techno/22.wav', './Techno/23.wav', './Techno/24.wav', './Techno/25.wav',
    './Techno/26.wav', './Techno/27.wav', './Techno/28.wav', './Techno/29.wav', './Techno/30.wav',
    './Techno/31.wav', './Techno/32.wav', './Techno/33.wav', './Techno/34.wav', './Techno/35.wav',
    './Techno/36.wav', './Techno/37.wav', './Techno/38.wav', './Techno/39.wav', './Techno/40.wav',
    './Techno/41.wav', './Techno/42.wav', './Techno/43.wav', './Techno/44.wav', './Techno/45.wav',
    './Techno/46.wav', './Techno/47.wav', './Techno/48.wav', './Techno/49.wav', './Techno/50.wav',
    './Techno/51.wav', './Techno/52.wav', './Techno/53.wav', './Techno/54.wav', './Techno/55.wav',
    './Techno/56.wav', './Techno/57.wav', './Techno/58.wav', './Techno/59.wav', './Techno/60.wav',
    './Techno/61.wav', './Techno/62.wav', './Techno/63.wav', './Techno/64.wav', './Techno/65.wav',
    './Techno/66.wav', './Techno/67.wav', './Techno/68.wav', './Techno/69.wav', './Techno/70.wav',
    './Techno/71.wav', './Techno/72.wav', './Techno/73.wav', './Techno/74.wav', './Techno/75.wav',
    './Techno/76.wav', './Techno/77.wav', './Techno/78.wav', './Techno/79.wav', './Techno/80.wav',
    './Techno/81.wav', './Techno/82.wav', './Techno/83.wav', './Techno/84.wav', './Techno/85.wav',
    './Techno/86.wav', './Techno/87.wav', './Techno/88.wav', './Techno/89.wav', './Techno/90.wav',
    './Techno/91.wav', './Techno/92.wav', './Techno/93.wav', './Techno/94.wav', './Techno/95.wav',
    './Techno/96.wav', './Techno/97.wav', './Techno/98.wav', './Techno/99.wav', './Techno/100.wav',
    
    // Media files
    './media/170bpm.mp3', './media/five.wav', './media/four.wav', './media/one.wav', './media/three.wav',
    './media/two.wav', './media/ting.mp3', './media/untitled.mp3', './media/I Am Disfigured.mp3'
];

// Install event - cache core files immediately
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    
    // Check if running in Electron (file:// protocol)
    const isElectron = typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Electron');
    
    event.waitUntil(
        Promise.all([
            // Only cache if NOT in Electron packaged app (file:// protocol)
            ...(isElectron ? [] : [
                // Cache core files
                caches.open(STATIC_CACHE).then(cache => {
                    console.log('Service Worker: Caching core files');
                    return cache.addAll(CORE_FILES);
                }).catch(error => {
                    console.log('Service Worker: Could not cache core files:', error);
                    return Promise.resolve();
                }),
                // Cache audio files in background
                caches.open(AUDIO_CACHE).then(cache => {
                    console.log('Service Worker: Caching audio files');
                    return Promise.allSettled(
                        AUDIO_FILES.map(audioFile => 
                            cache.add(audioFile).catch(error => {
                                console.log(`Failed to cache ${audioFile}:`, error);
                                return null;
                            })
                        )
                    );
                }).catch(error => {
                    console.log('Service Worker: Could not cache audio files:', error);
                    return Promise.resolve();
                })
            ]),
            // Skip waiting to activate immediately
            self.skipWaiting()
        ])
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheName !== STATIC_CACHE && 
                            cacheName !== DYNAMIC_CACHE && 
                            cacheName !== AUDIO_CACHE) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Take control of all clients
            self.clients.claim()
        ])
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // Skip chrome-extension and other non-http requests
    if (!url.protocol.startsWith('http')) {
        return;
    }

    event.respondWith(
        handleRequest(request)
    );
});

async function handleRequest(request) {
    const url = new URL(request.url);
    
    try {
        // Try cache first
        const cachedResponse = await getCachedResponse(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Fallback to network
        const networkResponse = await fetch(request);
        
        if (networkResponse.ok) {
            // Cache successful responses
            await cacheResponse(request, networkResponse.clone());
        }
        
        return networkResponse;
        
    } catch (error) {
        console.log('Service Worker: Network failed, trying cache:', error);
        
        // If network fails, try to serve from cache
        const cachedResponse = await getCachedResponse(request);
        if (cachedResponse) {
            return cachedResponse;
        }

        // If it's an audio file and we can't find it, return a placeholder
        if (url.pathname.match(/\.(mp3|wav|ogg|m4a)$/i)) {
            return new Response('', {
                status: 404,
                statusText: 'Audio file not available offline'
            });
        }

        // For HTML pages, return a basic offline page
        if (request.destination === 'document') {
            return new Response(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Psychological Studio - Offline</title>
                    <style>
                        body { 
                            background: #1a1a2e; 
                            color: #f0f0f0; 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            padding: 50px;
                        }
                        h1 { color: #717d9f; }
                    </style>
                </head>
                <body>
                    <h1>Psychological Studio</h1>
                    <p>You're currently offline. Some features may be limited.</p>
                    <p>Please check your internet connection and try again.</p>
                </body>
                </html>
            `, {
                headers: { 'Content-Type': 'text/html' }
            });
        }

        throw error;
    }
}

async function getCachedResponse(request) {
    const cacheNames = [STATIC_CACHE, DYNAMIC_CACHE, AUDIO_CACHE];
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const response = await cache.match(request);
        if (response) {
            return response;
        }
    }
    
    return null;
}

async function cacheResponse(request, response) {
    const url = new URL(request.url);
    let cacheName = DYNAMIC_CACHE;
    
    // Determine which cache to use based on file type
    if (url.pathname.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        cacheName = AUDIO_CACHE;
    } else if (CORE_FILES.some(file => url.pathname.endsWith(file.replace('./', '')))) {
        cacheName = STATIC_CACHE;
    }
    
    const cache = await caches.open(cacheName);
    await cache.put(request, response);
}

// Background sync for when connection is restored
self.addEventListener('sync', event => {
    if (event.tag === 'background-sync') {
        event.waitUntil(doBackgroundSync());
    }
});

async function doBackgroundSync() {
    console.log('Service Worker: Background sync triggered');
    // Here you could sync any pending data when connection is restored
}

// Handle messages from the main thread
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_AUDIO') {
        // Cache specific audio files on demand
        cacheAudioFiles(event.data.files);
    }
});

async function cacheAudioFiles(files) {
    const cache = await caches.open(AUDIO_CACHE);
    const promises = files.map(file => {
        return fetch(file)
            .then(response => cache.put(file, response))
            .catch(error => console.log('Failed to cache audio file:', file, error));
    });
    
    await Promise.all(promises);
    console.log('Service Worker: Audio files cached');
}