# Aydra Print Assistant

A Next.js web app for offset books and pamphlets. An operator uploads a print-ready PDF, sees its
preflight report, and types in plain language what they want ("top bind, title
lot pot"). An OpenAI model turns that sentence into a job spec, asks for anything
missing, and the app imposes the PDF as a Center Pin Offset Book on a 4-page
plate and hands back the imposed PDF with the fixed shop markers and gripper setup.

One- and two-page PDFs use the pamphlet workflow below. PDFs with three or more pages use the offset-book workflow. Other unrelated tasks are politely declined.

## Commands

- `yarn dev`: dev server on http://localhost:3000
- `yarn test`: unit tests (Vitest)
- `yarn lint`: lint
- `yarn build`: production build; must pass before a task is done

Environment (`.env.local`, never committed; document every key in `.env.example`):

- `OPENAI_API_KEY`: server-side only
- `OPENAI_MODEL`: the model id to call; never hardcode one in source

## Fixed offset-book rules (do not make these configurable)

| Setting | Value |
|---|---|
| Method | Offset Book, 4-page plate (8 pages per sheet, 4 per side) |
| Binding style | Center Pin (nested, saddle stitch). Normal Bind is not offered |
| Output plate | 530 × 664 mm portrait for left/right bind; 664 × 530 mm landscape for top/bottom bind |
| Input page size | A4 portrait (210 × 297 mm), every page. Tolerance ±5 mm on each dimension |
| Gutter | 0.3 in (7.62 mm), head to head between the two rows |
| Shop markers | Embed `public/marks/Marka.pdf` and `Marka-Centre.pdf`: six strips and three centre marks, rotated for the gripper. No additional generic cutting/registration marks |
| N-up / Mix n Match | Off: one signature positioned relative to the gripper per plate |
| Gripper | 15 mm process-black stripe with white "Aydra Labs Gripper" text along its length; artwork 45 mm from the gripper edge. Portrait front/right, back/left, Lot-Pot/right. Landscape always bottom, including Lot-Pot |
| Labels | Gripper-01 = front 1, Gripper-02 = back 1, etc. Title Lot-Pot reads "Title LOT-POT" and does not consume a number; the next plate starts Gripper-01. Inner Lot-Pot takes the next number with " Lot-POT" appended (20 pages: Gripper-05 Lot-POT; 28 pages: Gripper-07 Lot-POT). Labels sit in the centre gutter |

## What the book operator chooses (in free text)

1. **Binding edge**: `left`, `right`, `top` or `bottom`. Always required.
2. **Lot-Pot position**: `title` or `inner`. Only required when the (final) page
   count leaves 4 over after full sheets, i.e. `pageCount % 8 === 4`
   (12, 20, 28…). For multiples of 8 there is no Lot-Pot; never ask.
3. **Blank pages**: only when `pageCount % 4 !== 0`. The app needs
   `4 - pageCount % 4` blank pages matching the source dimensions, added either at the `end` or
   `before-back-cover` (keeps the last page last), or the operator declines and
   re-uploads. Adding blanks changes the page count, so the Lot-Pot rule is
   evaluated on the final count.

Plain-language hints the model should understand (ask when still ambiguous):
"calendar style" / "flip up" / "binding at the top" → top; "Urdu / Arabic /
right-to-left book" → right; "normal book" / "spine on the left" → left;
"saddle stitch" / "centre pin" → already fixed, no question. "Bind on the side"
is ambiguous (left or right): ask. Perfect binding, spiral, 8-page plate, other
plate sizes, custom marks, CMYK conversion, etc. are out of scope: say so briefly and
say what the app can do.

Lot-Pot meanings, for the model's explanations:
- **Title Lot-Pot**: pages 1, 2, N−1, N form the Lot-Pot and print first; the
  rest nest inside it.
- **Inner Lot-Pot**: the outer sheets nest as usual; the innermost 4 pages
  (e.g. 9–12 of 20) form the Lot-Pot, printed last.
- A Lot-Pot is one plate printed on both sides of a sheet (work and tumble),
  which is then cut in two.

## Architecture rules

- **The model never does imposition.** It only extracts `quantity` for pamphlets, or `binding`, `lotPot` and
  `blankPages` for books from the conversation and writes the chat reply. Page positions,
  sheet counts and page lists come only from the deterministic planner.
- **Deterministic code decides what is missing.** After merging the model's
  extraction, `lib/assistant/jobState.ts` computes the missing fields in the
  fixed order blank pages → binding → lot pot. If the model's reply is not asking
  about the first missing field, the server replaces it with the canned question
  for that field. The model can never declare a job ready.
- **Generation needs an explicit click** on the confirmation card. Never
  generate because the model said so.
- **The PDF never leaves the browser.** Preflight, imposition and PDF writing all
  run client-side. Only preflight facts (file name, page count, page size,
  uniformity, colour mode) and the chat text go to the server and to OpenAI.
- The OpenAI call lives only in a server route handler. The API key never
  reaches the client bundle.
- Use Structured Outputs (a strict JSON schema) for the model response and
  validate it again on the server (zod). Treat the model's output as untrusted.

## Imposition logic: reuse, don't rewrite

`reference/` holds the proven imposer from the Pressflow desktop app. It is
read-only: copy what you need into `lib/imposition/` and change it as little as
possible.

- `reference/pressflow-imposer/layout.ts`: `planImposition` / `planOffset`,
  the 4-page `PLATE_MAPS`, center-pin nesting and the Title/Inner Lot-Pot logic.
  This is the source of truth for page order.
- `bookPacking.ts`, `marks.ts`, `units.ts`, `types.ts`, `constants.ts`:
  dependencies of the planner (the reference defaults retain the original sheet; the app wrapper overrides it to 530 × 664 mm (landscape for top/bottom) and retains the 0.3 in gutter, 4-page plate, Center Pin).
- `pdfGenerator.ts`: writes the imposed PDF with pdf-lib, including 90/180/270°
  slot rotation.
- `pdfInspector.ts`, `pdfEngine.ts`: client-side preflight with pdf.js. `pdfEngine.ts`
  uses a Vite-only `?url` worker import; replace it with the Next.js-compatible
  `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` form and load
  pdf.js only in the browser.
- `PdfPreflightCard.tsx`, `SheetPreview.tsx`, `OffsetBookSettingsPanel.tsx`:
  Mantine UI from the desktop app, for reference on what to show and how to word
  it. Do not add Mantine; rebuild the UI in this app's own stack.
- `reference/tests/offset-book.test.mjs`: the planner's behaviour pinned against
  the shop's sample PDFs in `reference/samples/`. Port it to Vitest; it must keep
  passing unchanged in substance.

Keep `pdf-lib` at `1.17.1` (the version the generator was written against).

### Binding edges: the quarter-turn rule

The planner only knows a vertical spine (left bind). Every other edge is
imposed by turning each page so that its bound edge becomes the virtual left
edge, then running the unchanged left-bind planner:

| Binding | Page turn (clockwise) | Virtual page | Sheet |
|---|---|---|---|
| left | 0° | 210 × 297 mm | 530 × 664 mm portrait |
| right | 180° | 210 × 297 mm | 530 × 664 mm portrait |
| top | 270° (head faces left) | 297 × 210 mm | 664 × 530 mm landscape |
| bottom | 90° (foot faces left) | 297 × 210 mm | 664 × 530 mm landscape |

Each slot's final rotation is `((slot.rotated ? 180 : 0) + turn) % 360`, and the
slot's width and height stay the virtual page's (they already describe the
rotated bounding box, which is what `pdfGenerator.ts` expects). Folding is
unchanged, so page order and Lot-Pot logic stay exactly as the planner gives
them, and the Lot-Pot stays upright on the sheet so its work-and-tumble still
backs up.

A4 and both ±5 mm size boundaries must fit every binding on the plate with 45 mm gripper clearance with no warnings. If the sheet is not turned for top/bottom, the planner
warns that the signature is larger than the sheet. Never ship that.

Left bind matches the shop's sample PDFs. Right, top and bottom follow from the
rule above but have no shop sample yet, so the confirmation card must show
"Proof before plating: no shop sample verified for this binding yet" for them.
One known open question: the desktop app's Book / Brochure top bind turns the back
cover (last page) so it reads upright when the closed book is flipped side to
side; the quarter-turn rule does not. Do not add that exception unless a shop
sample shows it.

## Testing expectations

- Every change to `lib/imposition` or `lib/assistant` comes with Vitest tests.
- Mock the OpenAI client in tests; tests never hit the network.
- Before finishing: `yarn test`, `yarn lint` and `yarn build` all pass.

## Current UI and workflow preferences

Do not show fixed-setting badges (Center Pin, 4-page plate, sheet size, no marks) in the introductory UI. Keep the underlying fixed imposition settings. Preserve the accepted PDF dimensions when planning and inserting blanks. Use Yarn. The user runs production builds themselves; do not run a build unless requested.

## Shop marker reference

The user supplied `Marker Setting - brochure.pdf` as the placement reference. `plateLayout.ts` adds the gripper offset and per-side guides after the original planner determines page order. Portrait marks match the reference: six native-size Marka strips at the outside corners and centre row, plus three centre crosses along the spine. Landscape strips move outside the left/right edges so their 90° rotation clears the row gutter. Labels remain in the centre gutter. The original 20 mm sample stripe is replaced by the requested 15 mm stripe carrying white "Aydra Labs Gripper" lettering; do not copy the sample printer-name artwork. Marker PNGs are for preview only; production PDFs embed the original vector PDFs. The newer marker/plate instructions supersede the original no-marks/press-sheet-only rules.

The UI uses a white background with purple accents at all times. Do not follow the device dark-mode preference or restore an automatic dark theme.

## Pamphlet workflow

- One source page automatically means single-sided pamphlet; two means front/back (page 1 front, page 2 back). Do not add blanks or ask for binding or Lot-Pot. Ask only for the quantity of finished copies. Keep a local numeric entry field so the job can finish without OpenAI.
- Accept A5 (148 × 210 mm), half-letter (5.5 × 8.5 in), A4, or Letter (8.5 × 11 in), ±5 mm per dimension, either input orientation. Preserve actual dimensions. Mixed page sizes still block generation.
- Use one 530 × 664 mm portrait output plate, a right gripper, 45 mm artwork clearance, the existing 15 mm stripe and Aydra Labs Gripper lettering, shop Marka assets, and 7.62 mm centre gutter. The page block is centred vertically. Two-page layouts put both faces on the same plate, used with work and tumble; never emit a separate back plate.
- Deterministic template maps live in `lib/imposition/pamphlet.ts`; measured regression data from the user’s eight-page `Pamphlet Setting.pdf` lives in `tests/fixtures/pamphlet-reference.json`. Do not alter the original book planner.
- PROVISIONAL quantity cutoffs, disclosed to the user pending clarification: half-size low through 4,000, high from 4,001; full-size low through 2,100, high from 2,101. Page 4 is treated as half-size duplex because its measured rectangles match pages 3 and 4 (the user’s text named full-size). Keep these decisions explicit until confirmed.

| Reference page | Size family | Quantity tier | Source | Positions and turns (portrait-normalized input) |
|---|---|---|---|---|
| 1 | A5 / half-letter | Low | 1 page | 2 × 2, all page 1 upright |
| 2 | A5 / half-letter | Low | 2 pages | 2 × 2, top page 2 at 180°, bottom page 1 upright |
| 3 | A5 / half-letter | High | 1 page | 2 × 4, all page 1 at 270° |
| 4 | A5 / half-letter | High | 2 pages | 2 × 4, top half page 2, bottom half page 1; all 270° |
| 5 | A4 / Letter | Low | 1 page | 1 × 2, all page 1 at 270° |
| 6 | A4 / Letter | Low | 2 pages | 1 × 2, top page 2, bottom page 1; both 270° |
| 7 | A4 / Letter | High | 1 page | 2 × 2, all page 1 upright |
| 8 | A4 / Letter | High | 2 pages | 2 × 2, top page 2 at 180°, bottom page 1 upright |

Only the middle row boundary has a gutter; the other tile edges touch. For landscape source artwork, normalize fronts clockwise and backs counterclockwise so front/back heads agree after work-and-tumble. The output must keep every placement within the plate. Finished pieces per fully printed sheet equal the number of positions; net sheets = ceiling(quantity / positions), and double-sided impressions = twice net sheets. These counts exclude spoilage and setup waste. Quantity changes must re-plan the confirmation card; generation still requires an explicit click. All PDF processing remains in the browser.
