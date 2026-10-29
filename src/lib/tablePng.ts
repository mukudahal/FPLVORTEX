import { savePngBlob } from './savePng';
import { fit4kFrame } from './pngFrame';
/** Data-only canvas export: no DOM, web fonts, remote images, navigation or controls. */
export interface PngCell { text: string; color?: string }
export interface PngTable { title: string; headers: string[]; widths: number[]; rows: PngCell[][] }

type Block = { table: PngTable; rows: PngCell[][]; offset: number };

/** Split large tables into repeated-header blocks without losing rows. */
export function splitTables(tables: PngTable[], rowsPerBlock = 50): Block[] {
  if (!Number.isInteger(rowsPerBlock) || rowsPerBlock < 1) throw new RangeError('Invalid rows per block');
  return tables.flatMap(table => {
    if (table.headers.length !== table.widths.length || table.rows.some(row => row.length !== table.headers.length)) throw new Error('Invalid table shape');
    if (!table.rows.length) return [{ table, rows: [], offset: 0 }];
    const blocks: Block[] = [];
    for (let offset = 0; offset < table.rows.length; offset += rowsPerBlock) blocks.push({ table, rows: table.rows.slice(offset, offset + rowsPerBlock), offset });
    return blocks;
  });
}

function wrap(ctx: CanvasRenderingContext2D, input: string, width: number): string[] {
  const lines: string[] = [];
  for (const original of input.split('\n')) {
    let line = '';
    for (const word of original.split(/\s+/).filter(Boolean)) {
      let piece = word;
      while (ctx.measureText(piece).width > width && piece.length > 1) {
        let n = 1; while (n < piece.length && ctx.measureText(piece.slice(0, n + 1)).width <= width) n++;
        if (line) { lines.push(line); line = ''; }
        lines.push(piece.slice(0, n)); piece = piece.slice(n);
      }
      const candidate = line ? `${line} ${piece}` : piece;
      if (line && ctx.measureText(candidate).width > width) { lines.push(line); line = piece; } else line = candidate;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

export async function downloadTablePng(tables: PngTable[], filename: string): Promise<void> {
  const blocks = splitTables(tables, 24);
  if (!blocks.length) throw new Error('No table data available to save.');
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('PNG export is not supported by this browser.');
  const lineHeight = 19;
  const calculated = blocks.map(block => {
    const widths = block.table.widths;
    measure.font = 'bold 16px Arial, sans-serif';
    const titleLines = wrap(measure, block.table.title + (block.table.rows.length > 24 ? ` · ${block.offset + 1}–${block.offset + block.rows.length}` : ''), widths.reduce((a, b) => a + b, 0) - 16);
    const titleHeight = Math.max(32, titleLines.length * 19 + 12);
    measure.font = 'bold 12px Arial, sans-serif';
    const headerLines = block.table.headers.map((header, i) => wrap(measure, header, widths[i] - 10));
    const headerHeight = Math.max(34, Math.max(...headerLines.map(lines => lines.length)) * 14 + 12);
    measure.font = '14px Arial, sans-serif';
    const rowLines = block.rows.map(row => row.map((cell, i) => wrap(measure, cell.text, widths[i] - 12)));
    const rowHeights = rowLines.map(row => Math.max(30, 10 + lineHeight * Math.max(...row.map(lines => lines.length))));
    return { ...block, titleLines, titleHeight, headerLines, headerHeight, width: widths.reduce((a, b) => a + b, 0), rowLines, rowHeights, height: titleHeight + headerHeight + rowHeights.reduce((a, b) => a + b, 0) };
  });
  // Each page has one relevant table, with all rows preserved across pages.
  // Render only the requested page so a phone never holds dozens of 4K canvases.
  const renderPage = async (index: number): Promise<void> => {
    const block = calculated[index];
    if (!block) throw new Error('Export page unavailable.');
    const frame = fit4kFrame(block.width, block.height);
    const canvas = document.createElement('canvas');
    canvas.width = frame.width; canvas.height = frame.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create the PNG image.');
    ctx.fillStyle = '#070914'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(frame.x, frame.y); ctx.scale(frame.scale, frame.scale);
    const x = 0, y = 0;
      ctx.fillStyle = '#10243a'; ctx.fillRect(x, y, block.width, block.titleHeight);
      ctx.font = 'bold 16px Arial, sans-serif'; ctx.fillStyle = '#ffffff';
      block.titleLines.forEach((line, n) => ctx.fillText(line, x + 8, y + 21 + n * 19));
      let cx = x;
      for (let i = 0; i < block.table.headers.length; i++) {
        ctx.fillStyle = '#233c55'; ctx.fillRect(cx, y + block.titleHeight, block.table.widths[i], block.headerHeight);
        ctx.font = 'bold 12px Arial, sans-serif'; ctx.fillStyle = '#ffffff';
        block.headerLines[i].forEach((line, n) => ctx.fillText(line, cx + 5, y + block.titleHeight + 16 + n * 14));
        cx += block.table.widths[i];
      }
      let ry = y + block.titleHeight + block.headerHeight;
      block.rows.forEach((row, r) => {
        cx = x; const rh = block.rowHeights[r];
        row.forEach((cell, i) => {
          const w = block.table.widths[i]; ctx.fillStyle = cell.color ?? (r % 2 ? '#eef4f7' : '#ffffff'); ctx.fillRect(cx, ry, w, rh);
          ctx.strokeStyle = '#cbd9e2'; ctx.lineWidth = 1; ctx.strokeRect(cx, ry, w, rh);
          ctx.font = '14px Arial, sans-serif'; ctx.fillStyle = '#10243a';
          block.rowLines[r][i].forEach((line, n) => ctx.fillText(line, cx + 6, ry + 18 + n * lineHeight)); cx += w;
        });
        ry += rh;
      });
    ctx.restore();
    ctx.font = '500 24px Arial, sans-serif'; ctx.fillStyle = '#a6b2cd';
    ctx.fillText(`FPL VORTEX · 4K · Page ${index + 1} / ${calculated.length}`, 64, frame.height - 38);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG creation failed; try a smaller selection.');
  const base = filename.replace(/(-4k)?\.png$/i, '');
  await savePngBlob(blob, `${base}${calculated.length > 1 ? `-p${index + 1}` : ''}-4k.png`, {
    current: index, total: calculated.length, open: renderPage,
  });
  };
  await renderPage(0);
}
