export interface PackedSpread {
  x: number;
  y: number;
  width: number;
  height: number;
  turned: boolean;
}

/** Compare uniform grids and mixed horizontal/vertical bands, at actual size. */
export function packBookSpreads(sheetW: number, sheetH: number, spreadW: number, spreadH: number, mixed: boolean): PackedSpread[] {
  if (![sheetW, sheetH, spreadW, spreadH].every((n) => Number.isFinite(n) && n > 0)) return [];
  const fit = (space: number, size: number) => Math.max(0, Math.floor((space + 1e-6) / size));
  let best: PackedSpread[] = [];
  const consider = (slots: PackedSpread[]) => {
    if (slots.length > best.length || (slots.length === best.length &&
      slots.filter((s) => s.turned).length < best.filter((s) => s.turned).length)) best = slots;
  };

  // A vertical split complements horizontal bands (e.g. two landscape pieces
  // beside one portrait piece). Uniform grids are included in both searches.
  for (const transpose of [false, true]) {
    const w = transpose ? sheetH : sheetW;
    const h = transpose ? sheetW : sheetH;
    const a = transpose ? spreadH : spreadW;
    const b = transpose ? spreadW : spreadH;
    for (let rows = 0; rows <= fit(h, b); rows += 1) {
      if (!mixed && rows !== 0 && rows !== fit(h, b)) continue;
      const turnedRows = fit(h - rows * b, a);
      const slots: PackedSpread[] = [];
      const addRows = (count: number, columns: number, cellW: number, cellH: number, startY: number, turned: boolean) => {
        for (let row = 0; row < count; row += 1) {
          for (let col = 0; col < columns; col += 1) {
            const x = col * cellW;
            const y = startY + row * cellH;
            slots.push({ x: transpose ? y : x, y: transpose ? x : y,
              width: transpose ? cellH : cellW, height: transpose ? cellW : cellH, turned });
          }
        }
      };
      addRows(rows, fit(w, a), a, b, 0, false);
      if (mixed || rows === 0) addRows(turnedRows, fit(w, b), b, a, rows * b, true);
      consider(slots);
    }
  }
  const width = Math.max(0, ...best.map((s) => s.x + s.width));
  const height = Math.max(0, ...best.map((s) => s.y + s.height));
  return best.map((s) => ({ ...s, x: s.x + (sheetW - width) / 2, y: s.y + (sheetH - height) / 2 }));
}
