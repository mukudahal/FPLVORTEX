// One photo renderer for the dashboard, forecasts and squad lab.
export function playerPhotoSources(player) {
  const photo = String(player.photo ?? '').match(/^(?:p)?([1-9]\d{0,9})\.(?:png|jpg|jpeg|webp)$/i)?.[1];
  const code = photo ?? (/^[1-9]\d{0,9}$/.test(String(player.code ?? '')) ? String(player.code) : null);
  if (!code) return [];
  const base = 'https://resources.premierleague.com/premierleague/photos/players/';
  return [`${base}250x250/p${code}.png`, `${base}110x140/p${code}.png`];
}

export function playerPortrait(player, escape, large = false) {
  const sources = playerPhotoSources(player);
  const name = player.web_name || 'Player';
  const fallback = `<svg class="player-silhouette" viewBox="0 0 60 72" aria-hidden="true"><circle cx="30" cy="20" r="12" fill="currentColor"/><path d="M7 72V54c0-14 10-21 23-21s23 7 23 21v18" fill="currentColor"/></svg>`;
  return `<span class="portrait ${large ? 'large' : ''}" title="${escape(sources.length ? name : name + ' · Photo unavailable')}">${fallback}${sources.length ? `<img class="player-photo" loading="lazy" decoding="async" src="${sources[0]}" data-photo-fallback="${sources[1]}" alt="${escape(name)}">` : ''}</span>`;
}

export function installPlayerImageFallbacks(document) {
  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.tagName !== 'IMG' || !image.classList.contains('player-photo')) return;
    const fallback = image.dataset.photoFallback;
    delete image.dataset.photoFallback;
    if (fallback) image.src = fallback;
    else {
      image.hidden = true;
      image.parentElement.title = `${image.alt} · Photo unavailable`;
    }
  }, true);
}
