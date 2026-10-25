import {icon} from './icons.js';

const statusLabels = {a:'Available', d:'Doubtful', i:'Injured', s:'Suspended', u:'Unavailable', n:'Unavailable'};

export function availabilityFlag(player,escape) {
  const availability=playerAvailability(player);
  return availability.flagged ? `<button type="button" class="availability-flag ${availability.severity}" data-availability-player="${player.id}" aria-haspopup="dialog" aria-controls="availability-dialog" aria-label="${escape(player.web_name)}: ${availability.label}. View availability details" title="${escape(availability.label)} · Click for details">${icon('warning')}</button>` : '';
}

function playingChance(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

export function playerAvailability(player) {
  const status = typeof player?.status === 'string' ? player.status : '';
  const news = typeof player?.news === 'string' ? player.news.trim() : '';
  const nextChance = playingChance(player?.chance_of_playing_next_round);
  const thisChance = playingChance(player?.chance_of_playing_this_round);
  const flagged = status ? status !== 'a' : nextChance !== null && nextChance < 100;
  const unavailable = ['i','s','u','n'].includes(status) || flagged && nextChance === 0;
  const returnMatch = news.match(/\b(?:expected (?:back|to return)|(?:estimated )?return date|back (?:on|from)|suspended until|available from)\s*:?\s+([^.;\n]+?)(?=\s+-\s+|[.;\n]|$)/i);
  const newsDate = typeof player?.news_added === 'string' ? new Date(player.news_added) : null;
  return {
    flagged,
    severity: !flagged ? 'available' : unavailable ? 'unavailable' : 'doubtful',
    label: statusLabels[status] ?? (flagged ? 'Availability update' : 'Available'),
    reason: news.split(/\s+-\s+/)[0] || 'FPL has not published a reason.',
    news: news || 'No additional news published by FPL.',
    returnText: returnMatch?.[0] ?? 'No return date published by FPL.',
    thisChance,
    nextChance,
    updatedAt: newsDate && Number.isFinite(newsDate.getTime()) ? newsDate : null,
  };
}
