const resolvedPhotos = new Map();
export function playerPhotoSources(player) {
  const photo = String(player.photo ?? '').match(/^(?:p)?([1-9]\d{0,9})\.(?:png|jpg|jpeg|webp)$/i)?.[1];
  const code = /^[1-9]\d{0,9}$/.test(String(player.code ?? '')) ? String(player.code) : photo;
  if (!code) return [];
  const currentYear = new Date().getUTCFullYear() - (new Date().getUTCMonth()<6?1:0);
  const season = String(currentYear).slice(-2);
  const previousSeason = String(currentYear-1).slice(-2);
  const modern = 'https://premierleague-static-files.s3.amazonaws.com/';
  // The season-versioned collection is also served by the official resource CDN.
  // Never restore the obsolete unversioned /premierleague/photos/players/p… paths.
  const sources = [season,previousSeason].flatMap(version=>[`${modern}premierleague${version}/photos/players/500x500/${code}.png`,...['500x500','250x250'].map(size=>`https://resources.premierleague.com/premierleague${version}/photos/players/${size}/${code}.png`)]);
  return [...new Set([resolvedPhotos.get(code),...sources].filter(Boolean))];
}

export function playerPortrait(player, escape, large = false) {
  const sources = playerPhotoSources(player);
  const name = player.web_name || 'Player';
  const fallback = `<svg class="player-silhouette" viewBox="0 0 60 72" aria-hidden="true"><circle cx="30" cy="20" r="12" fill="currentColor"/><path d="M7 72V54c0-14 10-21 23-21s23 7 23 21v18" fill="currentColor"/></svg>`;
  const photoKey = /^[1-9]\d{0,9}$/.test(String(player.code??'')) ? String(player.code) : String(player.photo??'').replace(/\D/g,'');
  return `<span class="portrait ${large ? 'large' : ''}" title="${escape(sources.length ? name : name + ' · Photo unavailable')}">${fallback}${sources.length ? `<img class="player-photo" loading="lazy" decoding="async" src="${sources[0]}" data-photo-key="${photoKey}" data-photo-fallbacks="${escape(JSON.stringify(sources.slice(1)))}" alt="${escape(name)}">` : ''}</span>`;
}

export function installPlayerImageFallbacks(document) {
  document.addEventListener('error', event => {
    const image = event.target;
    if (image?.tagName !== 'IMG' || !image.classList.contains('player-photo')) return;
    let sources=[];
    try {sources=JSON.parse(image.dataset.photoFallbacks??'[]');} catch {}
    const fallback = sources.shift();
    image.dataset.photoFallbacks=JSON.stringify(sources);
    if (fallback) image.src = fallback;
    else {
      image.hidden = true;
      image.parentElement.title = `${image.alt} · Photo unavailable`;
    }
  }, true);
  document.addEventListener('load',event=>{
    const image=event.target;
    if(image?.tagName==='IMG'&&image.classList.contains('player-photo'))resolvedPhotos.set(image.dataset.photoKey,image.src);
  },true);
}
