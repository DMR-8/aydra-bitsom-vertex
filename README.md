# Aydra Offset Book Assistant

A single-purpose Next.js app for Center Pin Offset Book imposition. Upload a PDF, describe the binding, review the deterministic plate plan, and explicitly click **Generate imposed PDF** to create a download.

## Run locally

Requires Node.js 22.13+ (Node 24 recommended) and Yarn 1.22.22.

```sh
yarn install
cp .env.example .env.local
yarn dev
```

Open http://localhost:3000. In `.env.local`, set:

- `OPENAI_API_KEY`: your server-side OpenAI API key.
- `OPENAI_MODEL`: a model available to your account that supports Responses API Structured Outputs. No model is hardcoded.

Restart the server after changing environment variables. Without these variables, the assistant returns an explanatory 503 and the choice buttons still complete the job. Free text is not applied when the assistant is unavailable; use the buttons. To change an already completed job offline, use **Start over** (the file is retained).

```sh
yarn test
yarn lint
yarn build
yarn start
```

## Fixed press setup

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
