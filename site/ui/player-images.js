import { verifiedPlayerPhotoFallbacks } from './player-photo-overrides.js';

// This is the asset namespace published by the PL website, not the football season/year.
export const OFFICIAL_PHOTO_NAMESPACE = 'premierleague25';
export const PHOTO_FAILURE_RETRY_MS = 5 * 60 * 1000;
const PHOTO_SUCCESS_RETRY_MS = 6 * 60 * 60 * 1000;
const photoCache = new Map();
const installedDocuments = new WeakSet();

function playerPhotoCode(player) {
  const code = String(player.code ?? '');
  if (/^[1-9]\d{0,9}$/.test(code)) return code;
  return String(player.photo ?? '').match(/^(?:p)?([1-9]\d{0,9})\.(?:png|jpg|jpeg|webp)$/i)?.[1] ?? null;
}
function photoKey(player, large) {
  return `${OFFICIAL_PHOTO_NAMESPACE}:${playerPhotoCode(player)}:${player.team ?? ''}:${large ? 'large' : 'small'}`;
}
function rememberPhoto(key, url) {
  if (!key) return;
  const cached = photoCache.get(key);
  if (cached?.url === url && Date.now() - cached.checkedAt < (url ? PHOTO_SUCCESS_RETRY_MS : PHOTO_FAILURE_RETRY_MS)) return;
  photoCache.delete(key);
  photoCache.set(key, {url, checkedAt: Date.now()});
  if (photoCache.size > 1024) photoCache.delete(photoCache.keys().next().value);
}
export function resetPlayerImageFailures() {
  for (const [key, entry] of photoCache) if (!entry.url) photoCache.delete(key);
}
export function playerPhotoSources(player, large = false) {
  const code = playerPhotoCode(player);
  if (!code) return [];
  const resource = `https://resources.premierleague.com/${OFFICIAL_PHOTO_NAMESPACE}/photos/players/`;
  const mirror = `https://premierleague-static-files.s3.amazonaws.com/${OFFICIAL_PHOTO_NAMESPACE}/photos/players/500x500/${code}.png`;
  const sources = large
    ? [`${resource}500x500/${code}.png`, mirror, `${resource}250x250/${code}.png`, `${resource}110x140/${code}.png`]
    : [`${resource}110x140/${code}.png`, `${resource}250x250/${code}.png`, `${resource}500x500/${code}.png`, mirror];
  const verifiedFallback = verifiedPlayerPhotoFallbacks[code];
  if (verifiedFallback && verifiedFallback.birthDate === player.birth_date) sources.push(verifiedFallback.photoUrl);
  const cached = photoCache.get(photoKey(player, large));
  if (cached && Date.now() - cached.checkedAt < (cached.url ? PHOTO_SUCCESS_RETRY_MS : PHOTO_FAILURE_RETRY_MS)) {
    if (!cached.url) return [];
    return [...new Set([cached.url, ...sources])];
  }
  return sources;
}
export function playerPortrait(player, escape, large = false) {
  const sources = playerPhotoSources(player, large);
  const name = player.web_name || 'Player';
  const fallback = '<svg class="player-silhouette" viewBox="0 0 60 72" aria-hidden="true"><circle cx="30" cy="20" r="12" fill="currentColor"/><path d="M7 72V54c0-14 10-21 23-21s23 7 23 21v18" fill="currentColor"/></svg>';
  return `<span class="portrait ${large ? 'large' : ''}" title="${escape(sources.length ? name : name + ' · Photo unavailable')}">${fallback}${sources.length ? `<img class="player-photo" loading="lazy" decoding="async" src="${sources[0]}" data-photo-key="${escape(photoKey(player, large))}" data-photo-fallbacks="${escape(JSON.stringify(sources.slice(1)))}" alt="${escape(name)}">` : ''}</span>`;
}
export function installPlayerImageFallbacks(document) {
  if (installedDocuments.has(document)) return;
  installedDocuments.add(document);
  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.tagName !== 'IMG' || !image.classList.contains('player-photo') || image.hidden) return;
    let sources = [];
    try {
      const value = JSON.parse(image.dataset.photoFallbacks ?? '[]');
      if (Array.isArray(value)) sources = value.filter(source => typeof source === 'string');
    } catch {}
    const fallback = sources.shift();
    image.dataset.photoFallbacks = JSON.stringify(sources);
    if (fallback) image.src = fallback;
    else {
      image.hidden = true;
      image.parentElement.title = `${image.alt} · Photo unavailable`;
      rememberPhoto(image.dataset.photoKey, null);
    }
  }, true);
  document.addEventListener('load', event => {
    const image = event.target;
    if (image?.tagName === 'IMG' && image.classList.contains('player-photo')) {
      rememberPhoto(image.dataset.photoKey, image.src);
      if (image.src.startsWith('https://cdn.englandfootball.com/')) image.parentElement.title = `${image.alt} · Official England photo (national-team kit)`;
    }
  }, true);
}
