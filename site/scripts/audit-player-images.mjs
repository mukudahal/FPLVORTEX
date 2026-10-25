import { pathToFileURL } from 'node:url';
import { playerPhotoSources, playerClubBadgeSource } from '../ui/player-images.js';

export async function auditPlayerImages() {
  const response = await fetch('https://fantasy.premierleague.com/api/bootstrap-static/', {signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`Official player feed returned ${response.status}`);
  const bootstrap = await response.json();
  if (!Array.isArray(bootstrap.elements)) throw new Error('Official player feed has no elements');
  const results = new Array(bootstrap.elements.length);
  let cursor = 0;
  await Promise.all(Array.from({length: 8}, async () => {
    while (cursor < results.length) {
      const index = cursor++;
      const player = bootstrap.elements[index];
      const attempts = [];
      let photo = null;
      for (const url of playerPhotoSources(player)) {
        try {
          const image = await fetch(url, {signal: AbortSignal.timeout(8000)});
          const bytes = new Uint8Array(await image.arrayBuffer());
          const isPng = bytes.length > 24 && [137,80,78,71,13,10,26,10].every((value, offset) => bytes[offset] === value);
          attempts.push({url, status: image.status, validPng: isPng});
          if (image.ok && isPng && image.headers.get('content-type')?.startsWith('image/')) {
            photo = url;
            break;
          }
        } catch (error) {
          attempts.push({url, error: error.message});
        }
      }
      results[index] = {id: player.id, code: player.code, name: player.web_name, photo, clubBadge: playerClubBadgeSource(player), attempts};
    }
  }));
  return {checkedAt: new Date().toISOString(), total: results.length, photos: results.filter(result => result.photo).length, missing: results.filter(result => !result.photo).length, players: results};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await auditPlayerImages(), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
