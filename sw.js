// Офлайн-режим: все файлы игры кладутся в кэш. Сначала пробуем сеть (чтобы обновления доходили),
// без сети — берём из кэша. При изменении списка файлов поднимать версию.
const CACHE = 'hockey-v9';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/compat.js',
  'js/input.js',
  'js/sound.js',
  'js/music.js',
  'js/rink.js',
  'js/effects.js',
  'js/names.js',
  'js/game.js',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // cache: 'no-cache' — всегда сверяться с сайтом (GitHub разрешает браузеру 10 минут держать старые файлы).
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(e.request, copy));
        return response;
      })
      .catch(() => caches.match(e.request)),
  );
});
