'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { preflightPdf, type PreflightResult } from '../lib/preflight/check';
import { cannedQuestion, declineMessage, emptyState, finalPageCount, isReady, mergeState, missingFields, type JobState, type MissingField } from '../lib/assistant/jobState';
import { planOffsetBook } from '../lib/imposition/offsetBook';
import { physicalSheetCount } from '../lib/imposition/layout';
import { PamphletDetails } from '../components/PamphletDetails';
import { isPamphletPageCount } from '../lib/paper';
import { planPamphlet, PAMPHLET_QUANTITY_POLICY } from '../lib/imposition/pamphlet';
import { SheetPreview } from '../components/SheetPreview';
type Message = { role: 'user' | 'assistant'; content: string };
export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<PreflightResult | null>(null);
  const [state, setState] = useState<JobState>(emptyState);
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const epoch = useRef(0);
  const downloadUrl = useRef<string | null>(null);
  function clearDownload() { if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current); downloadUrl.current = null; setDownload(null); }
  function reset() { epoch.current++; setState(emptyState); setMessages([]); setPrompt(''); setQuantityInput(''); setError(''); clearDownload(); }
  async function upload(next: File) {
    if (busy) return;
    reset(); setReport(null); setFile(null);
    if (!/\.pdf$/i.test(next.name)) { setError('Choose a PDF file.'); return; }
    setBusy('Checking every page…');
    try { const result = await preflightPdf(next); setFile(next); setReport(result); }
    catch { setError('This PDF is unreadable or encrypted. Upload a valid, unlocked PDF.'); }
    finally { setBusy(''); }
  }
  const count = report?.inspection.pageCount ?? 0;
  const pamphlet = isPamphletPageCount(count);
  const allowed = !!report && !report.problems.length;
  const first = allowed ? missingFields(state, count)[0] : undefined;
  const question = first ? cannedQuestion(first, { state, pageCount: count }) : null;
  const ready = allowed && isReady(state, count);
  const pamphletPlan = ready && pamphlet ? planPamphlet({pageCount:count,pageSize:report!.inspection.pageSize,quantity:state.quantity!},PAMPHLET_QUANTITY_POLICY) : null;
  const plan = pamphletPlan ?? (ready && !pamphlet && state.binding ? planOffsetBook({ binding: state.binding, lotPot: state.lotPot, pageCount: finalPageCount(state, count), pageSize: report!.inspection.pageSize }) : null);
  function fallback(next: JobState, lead = '') {
    const field = missingFields(next, count)[0];
    const text = !pamphlet && count % 4 && next.blankPages === 'decline' ? declineMessage : field ? cannedQuestion(field, { state: next, pageCount: count }).text : 'Review the plan below, then click Generate imposed PDF.';
    setMessages(m => [...m, { role: 'assistant', content: `${lead}${text}` }]);
  }
  async function send(text: string, choice?: { field: MissingField; value: string }) {
    if (!text.trim() || busy || !allowed || !report) return;
    clearDownload(); setError(''); setPrompt('');
    const history: Message[] = [...messages, { role: 'user', content: text.slice(0, 2000) }];
    setMessages(history);
    if (choice) {
      const next = mergeState(state, { [choice.field]: choice.field === 'quantity' ? Number(choice.value) : choice.value }, count);
      setState(next); if (choice.field === 'quantity') setQuantityInput(String(next.quantity ?? '')); fallback(next); return;
    }
    const current = epoch.current;
    setBusy('Reading your instructions…');
    try {
      const i = report.inspection;
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preflight: { fileName: i.fileName, pageCount: count, pageWidthIn: i.pageSize.width / 72, pageHeightIn: i.pageSize.height / 72, uniform: i.uniformPageSize, colorMode: i.color.mode }, state, messages: history.slice(-20) }), signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error('Assistant unavailable');
      const data = await response.json();
      if (epoch.current !== current) return;
      setState(data.state); if (pamphlet) setQuantityInput(String(data.state.quantity ?? '')); setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch { if (epoch.current === current) fallback(state, 'The assistant is unavailable. Your text was not applied; use the choice buttons. '); }
    finally { setBusy(''); }
  }
  async function generate() {
    if (!file || !plan || plan.error || busy || (!pamphlet && !state.binding)) return;
    setBusy('Preparing your imposed PDF…'); setError(''); clearDownload();
    try {
      const { generateImposedPdf } = await import('../lib/imposition/pdfGenerator');
      const { insertBlankPages } = await import('../lib/imposition/blankPages');
      let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
      if (!pamphlet && count % 4 && state.blankPages && state.blankPages !== 'decline') bytes = await insertBlankPages(bytes, 4 - count % 4, state.blankPages, report!.inspection.pageSize);
      const markerResponses = await Promise.all(['/marks/Marka.pdf', '/marks/Marka-Centre.pdf'].map(path => fetch(path)));
      if (markerResponses.some(response => !response.ok)) throw new Error('Unable to load the plate markers.');
      const [corner, centre] = await Promise.all(markerResponses.map(async response => new Uint8Array(await response.arrayBuffer())));
      const output = await generateImposedPdf(bytes, plan, { corner, centre });
      const url = URL.createObjectURL(new Blob([new Uint8Array(output)], { type: 'application/pdf' }));
      downloadUrl.current = url;
      setDownload({ url, name: `${file.name.replace(/\.pdf$/i, '')}${pamphlet?'-pamphlet':`-offset-${state.binding}-bind`}.pdf` });
    } catch { setError('The PDF could not be generated. Check that the source is unlocked and the plate marker files are available.'); }
    finally { setBusy(''); }
  }
  return <main>
    <header><Link className="brand" href="/" aria-label="Aydra home"><span className="brand-icon">a</span> aydra<span className="brand-light"> / print tools</span></Link><span className="local-badge"><span /> Browser-local PDF</span></header>
    <section className="intro"><p className="eyebrow">PREPRESS, SIMPLIFIED</p><h1>Your print, ready for press.</h1><p>Upload your book or pamphlet PDF.<br />We’ll find the right layout for your next offset run.</p></section>
    <section className="panel"><div className="section-title"><span className="step">01</span><h2>Your print-ready PDF</h2></div>
      <div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}>
        <div className="file-icon" aria-hidden="true">↥</div><h3>{file ? file.name : 'Drop your PDF here'}</h3><p>Books: A4 portrait · Pamphlets (1–2 pages): A5, half-letter, A4 or Letter · ±5 mm</p>
        <input ref={fileInput} type="file" accept="application/pdf,.pdf" aria-label="Choose PDF" disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} className="sr-only" />
        <button className="secondary" disabled={!!busy} onClick={() => fileInput.current?.click()}>{file ? 'Replace PDF' : 'Choose PDF'} <span aria-hidden="true">↗</span></button>
        <small>Your PDF stays on this device. Only preflight facts and chat text go to the assistant.</small>
      </div>
      {report && <div className="preflight"><div className="section-title"><h3>Preflight report</h3><span className={allowed ? 'status-good' : 'status-bad'}>{allowed ? '✓ Ready to configure' : 'Needs attention'}</span></div>
        <dl><div><dt>Pages</dt><dd>{count}</dd></div><div><dt>Page size</dt><dd>{(report.inspection.pageSize.width / 72).toFixed(2)} × {(report.inspection.pageSize.height / 72).toFixed(2)} in</dd><small>{(report.inspection.pageSize.width / 72 * 25.4).toFixed(1)} × {(report.inspection.pageSize.height / 72 * 25.4).toFixed(1)} mm</small></div><div><dt>Uniform size</dt><dd>{report.inspection.uniformPageSize ? '✓ Yes' : '✗ No'}</dd></div><div><dt>Colour mode</dt><dd>{report.inspection.color.mode}</dd></div><div><dt>File size</dt><dd>{(report.inspection.fileSize / 1024 / 1024).toFixed(2)} MB</dd></div><div><dt>PDF version / standard</dt><dd>{report.inspection.pdfVersion ?? 'Unknown'} · {report.inspection.standard.label}</dd></div></dl>
        <p className="muted">{report.inspection.color.basis}</p>
        {report.problems.map(p => <p className="error" key={p}>{p}</p>)}{report.notes.map(n => <p className="note" key={n}>{n}</p>)}
      </div>}
    </section>
    <section className={`panel ${!allowed ? 'waiting' : ''}`}><div className="section-title"><span className="step">02</span><h2>{pamphlet?"How many pamphlets?":"Tell us about the book"}</h2>{allowed && <button className="text-button" disabled={!!busy} onClick={reset}>Start over</button>}</div>
      {!allowed ? <p className="muted">Choose a valid PDF to get started.</p> : <>
        {pamphlet && <form className="quantity-form" onSubmit={e=>{e.preventDefault();if (/^[1-9]\d*$/.test(quantityInput) && Number(quantityInput)<=1_000_000_000) void send(`${quantityInput} copies`,{field:'quantity',value:quantityInput});}}>
          <p className="muted">{count===1?'Single-sided pamphlet detected.':'Front/back pamphlet detected: page 1 is front, page 2 is back.'} Enter the finished quantity. No binding or blank pages are needed.</p>
          <label htmlFor="quantity">Finished copies</label>
          <div className="quantity-row"><input id="quantity" type="number" min="1" max="1000000000" step="1" required value={quantityInput} onChange={e=>setQuantityInput(e.target.value)} disabled={!!busy} placeholder={state.quantity?String(state.quantity):'e.g. 3000'} /><button type="submit" disabled={!!busy || !/^[1-9]\d*$/.test(quantityInput) || Number(quantityInput)>1_000_000_000}>Apply quantity</button></div>
        </form>}
        <div className="chat" aria-live="polite">{messages.map((m, i) => <div key={i} className={`message ${m.role}`}><small>{m.role === 'user' ? 'YOU' : 'AYDRA'}</small><p>{m.content}</p></div>)}</div>
        <form onSubmit={e => { e.preventDefault(); void send(prompt); }}><label className="sr-only" htmlFor="prompt">Instructions for your print job</label><textarea id="prompt" maxLength={2000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What do you want to do with this today?" disabled={!!busy} /><div className="composer-bottom"><small>{pamphlet?'Try “I need 3,000 copies”':'Try “top bind, title lot pot”'}</small><button disabled={!!busy || !prompt.trim()} type="submit">Send ↗</button></div></form>
        {question && first && <div className="question"><p>{question.text}</p><div className="options">{question.options.map(o => <button className="secondary" key={o.value} disabled={!!busy} onClick={() => void send(o.label, { field: first, value: o.value })}>{o.label}</button>)}</div></div>}
        {!pamphlet && state.blankPages === 'decline' && <p className="note">{declineMessage}</p>}
      </>}
    </section>
    {plan && <section className="panel confirmation"><div className="section-title"><span className="step">03</span><h2>Review your press plan</h2><span className="status-good">Ready for review</span></div><p>{plan.summary}</p>
      {pamphletPlan ? <PamphletDetails plan={pamphletPlan} /> : <dl><div><dt>Binding</dt><dd className="capitalize">{state.binding}</dd></div><div><dt>Lot-Pot</dt><dd className="capitalize">{state.lotPot ?? 'Not needed'}</dd></div><div><dt>Final pages</dt><dd>{finalPageCount(state, count)} ({finalPageCount(state, count) - count} blanks)</dd></div><div><dt>Physical sheets</dt><dd>{physicalSheetCount(plan)}</dd></div><div><dt>Output plate</dt><dd>{plan.sheetWidthMm} × {plan.sheetHeightMm} mm · {plan.sheetWidthMm > plan.sheetHeightMm ? 'Landscape' : 'Portrait'}</dd></div><div><dt>Blank placement</dt><dd>{state.blankPages ?? 'None'}</dd></div></dl>}
      {!pamphlet && state.binding !== 'left' && <p className="note">Proof before plating: no shop sample verified for this binding yet</p>}
      {plan.error && <p className="error">{plan.error}</p>}{plan.warnings.map(w => <p className="note" key={w}>{w}</p>)}
      <p className="muted">Dashed layout guides are preview-only. The PDF includes the Marka artwork, gripper labels and a 15 mm black gripper stripe. Artwork sits 45 mm from the gripper edge.</p><SheetPreview plan={plan} />
      <div className="generate"><p>Happy with the plan?<small>Generation runs entirely on your device.</small></p><button disabled={!!busy || !!plan.error} onClick={() => void generate()}>Generate imposed PDF ↓</button></div>
      {download && <a className="download" href={download.url} download={download.name}>Download {download.name} ↓</a>}
    </section>}
    {busy && <p role="status" className="activity">{busy}</p>}{error && <p role="alert" className="error">{error}</p>}
    <footer><span>AYDRA PRINT ASSISTANT</span><span>Books and pamphlets, prepared for press.</span></footer>
  </main>;
}
