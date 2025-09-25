const CACHE_NAME = 'rav-pwa-cache-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/main.js',
    '/style.css',
    '/manifest.json',
    // Adicione os caminhos dos seus ícones aqui
    '/icon-192x192.png', 
    '/icon-512x512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache aberto');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Retorna o recurso do cache se estiver disponível
        if (response) {
          return response;
        }
        // Se não estiver no cache, faz a requisição normal
        return fetch(event.request);
      }
    )
  );
});
