# Aydra Print Assistant

A Next.js app for Center Pin Offset Book and pamphlet imposition. Upload a PDF, describe the binding, review the deterministic plate plan, and explicitly click **Generate imposed PDF** to create a download.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended) and Yarn 1.22.22.

```sh
yarn install
cp .env.example .env.local
yarn dev
```

Open http://localhost:3000. In `.env.local`, set:

- `OPENAI_API_KEY`: your server-side OpenAI API key.
- `OPENAI_MODEL`: a model available to your account that supports image input and Responses API Structured Outputs. No model is hardcoded.

Restart the server after changing environment variables. Without these variables, the assistant returns an explanatory 503 and the choice buttons still complete the job. Free text is not applied when the assistant is unavailable; use the buttons. To change an already completed job offline, use **Start over** (the file is retained).

```sh
yarn test
yarn lint
yarn build
yarn start
```

## Fixed book press setup

- Center Pin / saddle stitch; 4-page plate, 8 pages per full sheet, 4 per side.
- Every input page must be A4 portrait (210 × 297 mm, ±5 mm on each dimension).
- Left/right: 530 × 664 mm portrait plates. Top/bottom: 664 × 530 mm landscape plates.
- Head-to-head gutter: 0.3 in. One signature per plate, positioned 45 mm from the gripper edge.
- Six native-size Marka strips and three centre marks, using the supplied vector PDFs, plus a 15 mm process-black gripper stripe with white **Aydra Labs Gripper** lettering along its length. Preview fold lines are never printed.
- Portrait fronts and Title/Inner Lot-Pots grip right; portrait backs grip left. Landscape plates always grip at the bottom. Marker artwork rotates to follow the gripper.
- Centre-gutter labels: Gripper-01 is front 1, Gripper-02 is back 1, then 03/04, etc. A Title Lot-Pot reads **Title LOT-POT** and the following plate starts at Gripper-01. An Inner Lot-Pot continues the sequence: **Gripper-05 Lot-POT** for 20 pages, **Gripper-07 Lot-POT** for 28 pages.
- No Normal Bind, N-up, Mix n Match, alternative sheets, or CMYK conversion.

Accepted dimensions range from 205–215 mm wide and 292–302 mm tall. The planner preserves the actual source size; inserted blanks match it. Fixed-setting badges are hidden in the introductory UI.

The operator chooses left, right, top, or bottom binding. Non-multiples of four require blank pages at the end or immediately before the back cover, or a new upload. Only final counts with four pages left after full sheets require a Title or Inner Lot-Pot. Title uses pages 1, 2, N−1, N and prints first. Inner uses the innermost four pages and prints last. A Lot-Pot is one plate used on both sides with work and tumble, then cut in two. The output contains that plate once; the physical sheet count includes it as one sheet.

## Proof status

Left binding is pinned by the reference regression maps from the shop samples. Right, top, and bottom use the documented quarter-turn rule and have no verified shop samples. Their confirmation cards say **“Proof before plating: no shop sample verified for this binding yet”**. Make a physical proof before plating these jobs.

Top binding does **not** add the desktop Book/Brochure back-cover exception. That question remains open until a shop sample establishes the required orientation.

## Privacy and architecture

PDF bytes, preflight, blank insertion, imposition, and PDF writing stay in the browser. The shop marker PDFs are fetched from this app’s `/marks/` directory. The only network submission is `/api/assistant`, containing the file name, page count and size, size uniformity, colour mode, current choices, and chat text. No file upload endpoint or persistent job storage exists. The OpenAI key is accessed only by the Node route, and Responses requests use `store: false`.

The model extracts choices and writes conversational replies using strict Structured Outputs, validated again with Zod. Pure job-state functions merge relevant fields and decide what is missing in the order blanks → binding → Lot-Pot. The server will not accept a Lot-Pot update without the operator naming that choice in the latest message. Readiness never comes from model text. Buttons apply explicit choices locally, including during an outage.

The planner and dependencies are copied from `reference/pressflow-imposer/`. The original `reference/` directory is untouched. `offsetBook.ts` fixes the shop settings and adds binding rotations without changing page order. The copied PDF writer adds an empty, nonprinting content stream for blank pages so pdf-lib 1.17.1 can embed them, and rejects encrypted sources. Colour classification is a heuristic inherited from the reference inspector, not a full print certification.

The route follows the official [OpenAI Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs). Deploy behind your existing operator access controls if making this app accessible beyond a trusted local workstation; it contains no account or authentication system.

## Verification and sample jobs

Vitest covers the full ported regression suite (including Normal Bind and N-up cases to preserve the shared planner), all four binding-edge invariants, plate bounds, page coverage, marker/gripper geometry, blank-page insertion and PDF generation, preflight rules, and the assistant route with a mocked OpenAI client. Tests never call OpenAI.

Generate numbered PDFs with head and edge labels:

```sh
yarn make-test-pdf 20
yarn make-test-pdf 16
yarn make-test-pdf 18
yarn make-test-pdf 8 artifacts/letter.pdf --letter
```

Files are written to the ignored `artifacts/` directory. Use these acceptance checks:

| Source | Instructions | Expected |
| --- | --- | --- |
| 20 pages | top bind, title lot pot | Landscape; Title Lot-Pot first; 3 physical sheets; proof note |
| 16 pages | left bind | No Lot-Pot question; 2 physical sheets |
| 20 pages | make me a booklet | Binding question; Right → Inner produces innermost pages 9–12 last |
| 18 pages | calendar style | Blank question first; after adding 2 blanks, asks Lot-Pot |
| Letter | any | Blocked with actual page sizes |
| 16 pages | 8-page plate on 20x30 | Fixed plate setup explained; binding question |

Also check the same flows with no API credentials, using the explicit choice buttons. Browser acceptance and live model behavior need verification in your environment; the automated route tests mock OpenAI.

The marker placement follows the supplied `Marker Setting - brochure.pdf`. The requested 15 mm stripe replaces its wider stripe with white Aydra Labs Gripper lettering. Landscape strips sit outside the left/right page edges so the rotated artwork does not overlap the narrow centre gutter. See `artifacts/plate-proof-left.pdf` and `artifacts/plate-proof-top.pdf` for locally generated proofs (ignored by Git).

## Pamphlet flow

Upload a one-page PDF for single-sided pamphlets or a two-page PDF for front/back pamphlets. The app detects the workflow and asks only for the **finished copy quantity**. Enter it in the local quantity field or chat. No blanks, binding choice, or Lot-Pot question is used. Supported formats are A5, half-letter (8.5 × 5.5 in), A4, and Letter, in either orientation, ±5 mm with uniform page sizes.

The eight layouts follow the user-supplied `Pamphlet Setting.pdf`. All use a 530 × 664 mm portrait plate with a right gripper, 45 mm artwork clearance, 7.62 mm centre gutter, and the existing Marka/gripper artwork. Two-page inputs use one combined front/back plate, printed on both sides with work and tumble.

| Source size | Quantity (provisional) | Single-sided | Front/back |
|---|---|---|---|
| A5 / half-letter | 1–4,000 | 4 fronts upright | 2 fronts + 2 backs, heads facing |
| A5 / half-letter | 4,001+ | 8 fronts, quarter-turned | 4 fronts + 4 backs, same quarter-turn |
| A4 / Letter | 1–2,100 | 2 fronts, quarter-turned | 1 front + 1 back, same quarter-turn |
| A4 / Letter | 2,101+ | 4 fronts upright | 2 fronts + 2 backs, heads facing |

The brief overlaps the half-size ranges at 4,001–4,099 and omits exactly 2,100 for full-size. The above boundaries are provisional and are shown on the confirmation card. Reference page 4 is treated as half-size duplex based on its measured page boxes, despite being described as 8.5 × 11 in the text. These three decisions remain open for shop confirmation.

The confirmation shows net press sheets and impressions (excluding spoilage), then requires a Generate click. A double-sided sheet produces the stated finished quantity only after both sides have been printed and cut. Layouts and orientations are deterministic, with rectangle and head-direction tests pinned to the reference. An eight-page rendered proof is available locally at `artifacts/pamphlet-layout-proofs.pdf` (ignored by Git).


## One-page labels / stickers

One-page uploads require explicit operator confirmation of Label / Sticker or Pamphlet before planning. The server-only `/api/classify` route suggests a type using a compressed first-page JPEG plus filename and dimensions through a vision-capable `OPENAI_MODEL`, with strict structured output. The original PDF stays local, but the artwork preview is sent to OpenAI (`store: false`); ambiguous inputs and API failures leave the manual buttons available. Suggestions never confirm a type or trigger generation. Two-page documents retain the front/back pamphlet workflow; books are unchanged.

Stickers repeat the entire source page at actual size onto one 13 × 19 in (330.2 × 482.6 mm) sheet. Fixed settings: 8 mm edge clearance, 15 × 15 mm empty corner squares, 2 mm horizontal/vertical gaps, centred artwork, no quantity question, native sticker corner markers from `public/marks/Sticker-Marka.pdf`, no gripper stripe. `lib/imposition/sticker.ts` compares uniform orientations and mixed row/column bands, checking clearance after centring. This is a bounded shelf search, not a proof of optimal arbitrary packing. Pages below 15 mm² are rejected to bound browser work. Generation remains an explicit click and runs locally. Pamphlet size checks apply after type confirmation; custom-size one-page sticker PDFs must not be rejected by pamphlet preflight.

Visual classification renders the single source page against white, preserving aspect ratio, with a maximum 1280 px side and JPEG quality 0.8 (lowered if needed). Preview data URLs are capped at 1,000,000 characters, and the classification endpoint accepts only JPEG data URLs, never remote image URLs or PDF uploads. Preview failures, ambiguous classifications, incompatible models and API outages preserve manual confirmation. Tests mock OpenAI and never send artwork to the network.

Sticker corner marks: embed the supplied `New Sticker Marka.pdf` (stored as `public/marks/Sticker-Marka.pdf`) as a native-size 13 × 19 inch vector overlay. Preserve its four inward black L marks and red squares, their positions and colours. The PNG is preview-only. Marker centre lines sit 6 mm from sheet edges, with 20 mm arms and 8 mm red squares. Artwork retains the 8 mm edge margin and 15 mm corner keep-out; these reserved areas accommodate the marks. Never scale this overlay onto a different sheet size or reuse book gripper assets for stickers.
