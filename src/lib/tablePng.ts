import { savePngBlob } from './savePng';
/** Data-only canvas export: no DOM, web fonts, remote images, navigation or controls. */
export interface PngCell { text: string; color?: string }
export interface PngTable { title: string; headers: string[]; widths: number[]; rows: PngCell[][] }

type Block = { table: PngTable; rows: PngCell[][]; offset: number };

/** Split large tables into repeated-header blocks to keep a single PNG reasonably readable. */
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
  const blocks = splitTables(tables);
  if (!blocks.length) throw new Error('No table data available to save.');
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('PNG export is not supported by this browser.');
  const lineHeight = 19, gap = 12;
  const calculated = blocks.map(block => {
    const widths = block.table.widths;
    measure.font = 'bold 16px Arial, sans-serif';
    const titleLines = wrap(measure, block.table.title + (block.table.rows.length > 50 ? ` · ${block.offset + 1}–${block.offset + block.rows.length}` : ''), widths.reduce((a, b) => a + b, 0) - 16);
    const titleHeight = Math.max(32, titleLines.length * 19 + 12);
    measure.font = 'bold 12px Arial, sans-serif';
    const headerLines = block.table.headers.map((header, i) => wrap(measure, header, widths[i] - 10));
    const headerHeight = Math.max(34, Math.max(...headerLines.map(lines => lines.length)) * 14 + 12);
    measure.font = '14px Arial, sans-serif';
    const rowLines = block.rows.map(row => row.map((cell, i) => wrap(measure, cell.text, widths[i] - 12)));
    const rowHeights = rowLines.map(row => Math.max(30, 10 + lineHeight * Math.max(...row.map(lines => lines.length))));
    return { ...block, titleLines, titleHeight, headerLines, headerHeight, width: widths.reduce((a, b) => a + b, 0), rowLines, rowHeights, height: titleHeight + headerHeight + rowHeights.reduce((a, b) => a + b, 0) };
  });
  const columns = calculated.length === 2 ? 2 : calculated.length > 3 ? Math.min(3, calculated.length) : 1;
  const groups = Array.from({ length: Math.ceil(calculated.length / columns) }, (_, i) => calculated.slice(i * columns, (i + 1) * columns));
  const columnWidths = Array.from({ length: columns }, (_, col) => Math.max(...groups.map(group => group[col]?.width ?? 0)));
  const offsets = columnWidths.map((_, col) => columnWidths.slice(0, col).reduce((sum, value) => sum + value + gap, 0));
  const width = columnWidths.reduce((sum, value) => sum + value, 0) + (columns - 1) * gap;
  const heights = groups.map(group => Math.max(...group.map(block => block.height)));
  const height = heights.reduce((a, b) => a + b, 0) + gap * (groups.length - 1);
  const scale = Math.min(2, Math.sqrt(14_000_000 / (width * height)), 15000 / width, 15000 / height);
  if (!Number.isFinite(scale) || scale < 0.3) throw new Error('This table is too large for one readable PNG. Narrow the filters and try again.');
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create the PNG image.');
  ctx.scale(scale, scale); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (let g = 0; g < groups.length; g++) {
    for (let col = 0; col < groups[g].length; col++) {
      const block = groups[g][col], x = offsets[col];
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
    }
    y += heights[g] + gap;
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG creation failed; try a smaller selection.');
  await savePngBlob(blob, filename);
}
