import { choosePngDestination, savePngBlob } from './savePng';

export interface PitchPlayer {
  name: string;
  position: string;
  team: string;
  score: string;
  fixture: string;
  fixtureColor?: string;
  captain?: boolean;
  vice?: boolean;
  flag?: string;
  price?: string;
}

/** Draw a self-contained, full-size pitch; no external player photos are needed. */
export async function downloadPitchPng(rows: PitchPlayer[][], bench: PitchPlayer[], gw: number, filename: string): Promise<void> {
  const destination = await choosePngDestination(filename);
  const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 1650;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('PNG export is not supported by this browser.');
  ctx.fillStyle = '#123f37'; ctx.fillRect(0, 0, 1400, 1650);
  ctx.fillStyle = '#0f5647'; ctx.fillRect(35, 95, 1330, 1150);
  for (let i = 0; i < 8; i += 2) { ctx.fillStyle = 'rgba(255,255,255,.025)'; ctx.fillRect(35, 95 + i * 143.75, 1330, 143.75); }
  ctx.strokeStyle = 'rgba(255,255,255,.32)'; ctx.lineWidth = 4; ctx.strokeRect(65, 120, 1270, 1095);
  ctx.strokeRect(450, 120, 500, 140); ctx.strokeRect(550, 120, 300, 65);
  ctx.beginPath(); ctx.moveTo(65, 667); ctx.lineTo(1335, 667); ctx.stroke();
  ctx.beginPath(); ctx.arc(700, 667, 100, 0, 2 * Math.PI); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 36px Arial'; ctx.fillText(`FPL VORTEX  ·  GW ${gw}`, 700, 60);
  const drawPlayer = (p: PitchPlayer, x: number, y: number, isBench: boolean) => {
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 23px Arial'; ctx.fillText(p.score, x, y - 36, 240);
    ctx.fillStyle = '#d8f5ec'; ctx.beginPath(); ctx.arc(x, y + 6, 36, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#164b40'; ctx.font = 'bold 17px Arial'; ctx.fillText(p.team, x, y + 12, 64);
    if (p.captain || p.vice) { ctx.fillStyle = '#ffe39b'; ctx.beginPath(); ctx.arc(x + 43, y - 16, 15, 0, 2 * Math.PI); ctx.fill(); ctx.fillStyle = '#10243a'; ctx.font = 'bold 16px Arial'; ctx.fillText(p.captain ? 'C' : 'V', x + 43, y - 10); }
    ctx.fillStyle = '#092d29'; ctx.fillRect(x - 120, y + 51, 240, 39); ctx.fillStyle = '#fff'; ctx.font = 'bold 23px Arial'; ctx.fillText(`${p.name}${p.flag ? ' !' : ''}`, x, y + 77, 228);
    ctx.fillStyle = p.fixtureColor ?? '#e0e6e5'; ctx.fillRect(x - 120, y + 93, 240, 36); ctx.fillStyle = '#10243a'; ctx.font = 'bold 20px Arial'; ctx.fillText(p.fixture, x, y + 118, 230);
    if (isBench) { ctx.fillStyle = '#fff'; ctx.font = '18px Arial'; ctx.fillText(`${p.position} · ${p.team}${p.price ? ` · ${p.price}` : ''}`, x, y + 153, 240); }
  };
  rows.forEach((row, r) => row.forEach((player, i) => drawPlayer(player, 120 + (1160 * (i + 0.5)) / row.length, 235 + r * 245, false)));
  ctx.fillStyle = '#102e2a'; ctx.fillRect(35, 1265, 1330, 345); ctx.fillStyle = '#fff'; ctx.font = 'bold 27px Arial'; ctx.fillText('BENCH · SUBSTITUTES', 700, 1305);
  bench.forEach((player, i) => drawPlayer(player, 120 + (1160 * (i + 0.5)) / bench.length, 1385, true));
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG creation failed.');
  await savePngBlob(blob, filename, destination);
}
