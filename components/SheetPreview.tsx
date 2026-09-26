import { gripperText } from '../lib/imposition/gripperText';
import type { ImpositionPlan } from '../lib/imposition/layout';
export function SheetPreview({ plan }: { plan: ImpositionPlan }) {
  return <div className="preview-grid">{plan.sheets.map((sheet, index) => <figure key={index}>
    <figcaption>{sheet.label}{sheet.lotPot ? ' · Work & tumble' : ''}{sheet.plate ? ` · ${sheet.plate.label}` : ''}</figcaption>
    <svg role="img" aria-label={`${sheet.label}: pages ${sheet.slots.map(s => s.page).join(', ')}`} viewBox={`0 0 ${plan.sheetWidthMm} ${plan.sheetHeightMm}`}>
      <rect width={plan.sheetWidthMm} height={plan.sheetHeightMm} fill="#ffffff" />
      {sheet.plate && <rect x={sheet.plate.gripper === 'right' ? plan.sheetWidthMm-sheet.plate.stripeWidth : 0} y={sheet.plate.gripper === 'bottom' ? plan.sheetHeightMm-sheet.plate.stripeWidth : 0} width={sheet.plate.gripper === 'bottom' ? plan.sheetWidthMm : sheet.plate.stripeWidth} height={sheet.plate.gripper === 'bottom' ? sheet.plate.stripeWidth : plan.sheetHeightMm} fill="#000" />}
      {sheet.slots.map((slot, i) => <g key={i}>
        <rect x={slot.x} y={slot.y} width={slot.width} height={slot.height} fill={slot.rotation ? '#ede9fe' : '#f5f3ff'} stroke="#a78bfa" strokeWidth="1" />
        <text x={slot.x + slot.width / 2} y={slot.y + slot.height / 2} textAnchor="middle" dominantBaseline="middle" fontSize="45" fill="#4c1d95" transform={`rotate(${slot.rotation ?? 0} ${slot.x + slot.width / 2} ${slot.y + slot.height / 2})`}>{slot.page}</text>
        <text x={slot.x + 12} y={slot.y + 22} fontSize="13" fill="#5b21b6">{slot.rotation === 180 ? '↻ 180°' : slot.rotation === 90 ? '↷ 90°' : slot.rotation === 270 ? '↶ 270°' : '↑ Head'}</text>
      </g>)}
      {(sheet.guides ?? plan.guides)?.x.map(x => <line key={`x${x}`} x1={x} x2={x} y1="0" y2={plan.sheetHeightMm} stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="5 5" />)}
      {(sheet.guides ?? plan.guides)?.y.map(y => <line key={`y${y}`} x1="0" x2={plan.sheetWidthMm} y1={y} y2={y} stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="5 5" />)}
      {sheet.plate?.markers.map((marker, i) => <g key={`mark-${i}`} transform={`translate(${marker.x+marker.width/2} ${marker.y+marker.height/2}) rotate(${marker.rotation})`}>
        <image href={marker.asset === 'corner' ? '/marks/Marka.png' : '/marks/Marka-Centre.png'} x={-(marker.rotation===90 ? marker.height : marker.width)/2} y={-(marker.rotation===90 ? marker.width : marker.height)/2} width={marker.rotation===90 ? marker.height : marker.width} height={marker.rotation===90 ? marker.width : marker.height} />
      </g>)}
      {sheet.plate && <text x={sheet.plate.labelX} y={sheet.plate.labelY} textAnchor="middle" dominantBaseline="middle" fontSize={8*25.4/72} fill="#000" transform={`rotate(${sheet.plate.rotation} ${sheet.plate.labelX} ${sheet.plate.labelY})`}>{sheet.plate.label}</text>}
      {sheet.plate && (() => {
        const text = gripperText(sheet.plate, plan.sheetWidthMm, plan.sheetHeightMm);
        return <text x={text.x} y={text.y} textAnchor="middle" dominantBaseline="central" fontFamily="Helvetica, Arial, sans-serif" fontWeight="bold" fontSize={text.fontSizePt*25.4/72} fill="#fff" transform={`rotate(${text.rotation} ${text.x} ${text.y})`}>{text.text}</text>;
      })()}
    </svg>
  </figure>)}</div>;
}
