/** Render only the first page for visual classification. Original PDF bytes stay local. */
export async function classificationPreview(file: File): Promise<string> {
  const { getDocument } = await import('./pdfEngine');
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const canvas = document.createElement('canvas');
  const timeout = setTimeout(() => { void task.destroy(); }, 20_000);
  try {
    const pdf = await task.promise;
    if (pdf.numPages !== 1) throw new Error('Visual classification requires one page.');
    const page = await pdf.getPage(1);
    const original = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 1280 / Math.max(original.width, original.height) });
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    await page.render({ canvas, viewport, background: 'rgb(255,255,255)' }).promise;
    for (const quality of [0.8, 0.6, 0.4]) {
      const image = canvas.toDataURL('image/jpeg', quality);
      if (image.startsWith('data:image/jpeg;base64,') && image.length <= 1_000_000) return image;
    }
    throw new Error('Unable to create a compact classification preview.');
  } finally {
    clearTimeout(timeout);
    canvas.width = canvas.height = 0;
    await task.destroy();
  }
}
