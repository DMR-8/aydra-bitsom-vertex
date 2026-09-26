import { PAMPHLET_QUANTITY_POLICY, type PamphletPlan } from '../lib/imposition/pamphlet';
export function PamphletDetails({ plan }: { plan: PamphletPlan }) {
  const p=plan.pamphlet;
  const cutoff=p.family==='half'?PAMPHLET_QUANTITY_POLICY.halfLargeFrom:PAMPHLET_QUANTITY_POLICY.fullLargeFrom;
  return <>
    <dl>
      <div><dt>Job</dt><dd>{p.doubleSided?'Front / back pamphlet':'Single-sided pamphlet'}</dd></div>
      <div><dt>Page size</dt><dd>{p.paperName}</dd></div>
      <div><dt>Finished quantity</dt><dd>{p.quantity.toLocaleString('en-US')}</dd></div>
      <div><dt>Plate layout</dt><dd>{p.frontPositions} front{p.backPositions?` + ${p.backPositions} back`:''}</dd></div>
      <div><dt>Net press sheets</dt><dd>{p.netSheets.toLocaleString('en-US')}</dd></div>
      <div><dt>Press impressions</dt><dd>{p.impressions.toLocaleString('en-US')}</dd></div>
      <div><dt>Output plate</dt><dd>{plan.sheetWidthMm} × {plan.sheetHeightMm} mm · Portrait</dd></div>
      <div><dt>Gripper</dt><dd>Right · 45 mm artwork clearance</dd></div>
    </dl>
    <p className="note">Quantity rule: {p.family==='half'?'4-up':'2-up'} through {(cutoff-1).toLocaleString('en-US')} copies; {p.family==='half'?'8-up':'4-up'} from {cutoff.toLocaleString('en-US')}. Review the arrangement below before plating.</p>
    <p className="muted">{p.orientation}. Quantities exclude setup waste and spoilage.{p.doubleSided?' Print the same plate on both sides, tumbling head to foot, then cut; both sides must be printed to obtain the stated finished quantity.':''}</p>
  </>;
}
