import type { ImpositionPlan, PlacedPage, PlannedSheet } from "./layout";

interface SheetPreviewProps {
  plan: ImpositionPlan;
  sheet: PlannedSheet;
  thumbnails: ReadonlyMap<number, string>;
}

/**
 * The sheet drawn to scale in millimetres: edge margin, corner keep-out, fold
 * guides, and every placement with its page number and head direction. The
 * thumbnail follows the page rotation, including quarter-turned book spreads.
 */
export function SheetPreview({ plan, sheet, thumbnails }: SheetPreviewProps) {
  const w = plan.sheetWidthMm;
  const h = plan.sheetHeightMm;
  const pad = Math.max(w, h) * 0.03;
  // Everything visual scales with the sheet, so a business-card sheet and a
  // 23 x 36 in press sheet both read at the same size on screen.
  const u = Math.min(w, h) / 100;
  const marks = sheet.marks ?? plan.marks;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}`}
      width="100%"
      style={{ maxHeight: 520, display: "block" }}
      role="img"
      aria-label={sheet.label}
    >
      <defs>
        <filter id="sheet-shadow" x="-5%" y="-5%" width="110%" height="115%">
          <feDropShadow dx="0" dy={u * 0.8} stdDeviation={u * 1.2} floodColor="#111827" floodOpacity="0.14" />
        </filter>
        <pattern id="corner-hatch" patternUnits="userSpaceOnUse" width={u * 2} height={u * 2} patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2={u * 2} stroke="#f87171" strokeWidth={u * 0.5} />
        </pattern>
      </defs>

      <rect x={0} y={0} width={w} height={h} fill="#ffffff" stroke="#c4b5fd" strokeWidth={u * 0.35} filter="url(#sheet-shadow)" />

      {plan.marginMm !== undefined && plan.marginMm > 0 && (
        <rect
          x={plan.marginMm}
          y={plan.marginMm}
          width={Math.max(0, w - plan.marginMm * 2)}
          height={Math.max(0, h - plan.marginMm * 2)}
          fill="none"
          stroke="#a78bfa"
          strokeWidth={u * 0.25}
          strokeDasharray={`${u * 1.2} ${u * 0.9}`}
        />
      )}

      {plan.cornerMm !== undefined && plan.cornerMm > 0 && (
        <g>
          {[
            [0, 0],
            [w - plan.cornerMm, 0],
            [0, h - plan.cornerMm],
            [w - plan.cornerMm, h - plan.cornerMm],
          ].map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width={plan.cornerMm}
              height={plan.cornerMm}
              fill="url(#corner-hatch)"
              stroke="#f87171"
              strokeWidth={u * 0.25}
              opacity={0.8}
            />
          ))}
        </g>
      )}

      {plan.guides && (
        <g stroke="#9ca3af" strokeWidth={u * 0.22} strokeDasharray={`${u * 1.6} ${u * 1}`}>
          {plan.guides.x.map((x) => (
            <line key={`gx-${x}`} x1={x} y1={0} x2={x} y2={h} />
          ))}
          {plan.guides.y.map((y) => (
            <line key={`gy-${y}`} x1={0} y1={y} x2={w} y2={y} />
          ))}
        </g>
      )}

      {sheet.slots.map((slot, index) => (
        <Placement key={index} slot={slot} thumbnail={slot.page ? thumbnails.get(slot.page) : undefined} u={u} />
      ))}

      {sheet.bookSpreads && (
        <g stroke="#9ca3af" strokeWidth={u * 0.22} strokeDasharray={`${u * 1.6} ${u * 1}`}>
          {sheet.bookSpreads.map((s, index) => s.folds
            ? (
              <g key={index}>
                {s.folds.x.map((x) => <line key={`x-${x}`} x1={x} y1={s.y} x2={x} y2={s.y + s.height} />)}
                {s.folds.y.map((y) => <line key={`y-${y}`} x1={s.x} y1={y} x2={s.x + s.width} y2={y} />)}
              </g>
            )
            : s.foldAxis === "x"
              ? <line key={index} x1={s.x + s.width / 2} y1={s.y} x2={s.x + s.width / 2} y2={s.y + s.height} />
              : <line key={index} x1={s.x} y1={s.y + s.height / 2} x2={s.x + s.width} y2={s.y + s.height / 2} />)}
        </g>
      )}

      {marks && (marks.lines.length > 0 || marks.circles.length > 0) && (
        <g strokeLinecap="butt" fill="none">
          {marks.lines.map((line, index) => (
            <line
              key={`mark-${index}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke={markColor(line.kind)}
              strokeWidth={u * 0.3}
            />
          ))}
          {marks.circles.map((circle, index) => (
            <circle key={`reg-${index}`} cx={circle.cx} cy={circle.cy} r={circle.r} stroke={markColor(circle.kind)} strokeWidth={u * 0.3} />
          ))}
        </g>
      )}
    </svg>
  );
}

/** Inner marks read red on screen, as in the shop's reference; everything else is registration black. */
function markColor(kind: "cut-outer" | "cut-inner" | "fold" | "registration") {
  return kind === "cut-inner" ? "#dc2626" : "#111827";
}

function Placement({ slot, thumbnail, u }: { slot: PlacedPage; thumbnail?: string; u: number }) {
  const { x, y, width, height } = slot;
  const rotation = slot.rotation ?? (slot.rotated ? 180 : 0);
  const rotated = rotation !== 0;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const quarterTurn = rotation === 90 || rotation === 270;
  const contentWidth = quarterTurn ? height : width;
  const contentHeight = quarterTurn ? width : height;
  const contentX = cx - contentWidth / 2;
  const contentY = cy - contentHeight / 2;

  if (slot.page === null) {
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill="#f9fafb" stroke="#d1d5db" strokeWidth={u * 0.25} strokeDasharray={`${u} ${u * 0.8}`} />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={Math.min(u * 4, height * 0.3)} fill="#9ca3af" fontWeight={700}>
          empty
        </text>
      </g>
    );
  }

  // Labels follow the page they sit on (with a floor tied to the sheet), so a
  // two-page spread and a 24-up card sheet both stay legible.
  const shortEdge = Math.min(width, height);
  const labelSize = Math.min(Math.max(u * 3.6, shortEdge * 0.09), shortEdge * 0.25);
  const badgeH = labelSize * 1.5;
  const badgeW = labelSize * (slot.page >= 100 ? 3.4 : slot.page >= 10 ? 2.7 : 2.1);
  const headSize = Math.min(Math.max(u * 2.2, shortEdge * 0.06), shortEdge * 0.18);

  return (
    <g>
      {/* The page itself, turned with its content when rotated. */}
      <g transform={rotated ? `rotate(${rotation} ${cx} ${cy})` : undefined}>
        {thumbnail ? (
          <image href={thumbnail} x={contentX} y={contentY} width={contentWidth} height={contentHeight} preserveAspectRatio="none" />
        ) : (
          <>
            <rect x={contentX} y={contentY} width={contentWidth} height={contentHeight} fill="#f5f3ff" />
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={shortEdge * 0.3}
              fill="#c4b5fd"
              fontWeight={900}
            >
              {slot.page}
            </text>
          </>
        )}
        {/* Head marker: sits at the page's top edge, so it points down once rotated. */}
        <polygon
          points={`${cx - headSize},${contentY + headSize * 1.2} ${cx + headSize},${contentY + headSize * 1.2} ${cx},${contentY + headSize * 0.25}`}
          fill={rotated ? "#f59e0b" : "#7c3aed"}
          opacity={0.9}
        />
      </g>

      <rect x={x} y={y} width={width} height={height} fill="none" stroke={rotated ? "#f59e0b" : "#7c3aed"} strokeWidth={u * 0.3} />

      {/* Page number, always upright so the sheet stays readable. */}
      <g transform={`translate(${x + u * 0.6} ${y + u * 0.6})`}>
        <rect width={badgeW} height={badgeH} rx={badgeH * 0.3} fill={rotated ? "#f59e0b" : "#7c3aed"} />
        <text x={badgeW / 2} y={badgeH / 2} textAnchor="middle" dominantBaseline="central" fontSize={labelSize} fill="#ffffff" fontWeight={800}>
          {rotated ? `${slot.page}↻` : slot.page}
        </text>
      </g>
    </g>
  );
}
