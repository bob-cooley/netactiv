# handWriter — Execution Plan

Live target: netactiv.com/handwriter/
Repo folder: /handwriter/ (this folder)

## What it is

A pipeline that turns a person's handwriting (via a printed/scanned template) into a
personalized font set, then a separate output layer that blends letters across that
set so typed text looks hand-varied rather than mechanically repeated.

## Verdict

Buildable in phases. The "scan handwriting, get a font" core is solved territory —
Calligraphr, iFontMaker, and MyScriptFont already do it commercially. handWriter's
differentiator (multi-alphabet blending + kerning-aware natural output) is real
extra work but not unproven science. The one genuinely open R&D question is the
final step: getting randomized multi-glyph output to work *inside* Word, Google
Docs, and OS-level typing, not just in design apps. That part gets its own phase
and its own honesty check below — don't sell it as "done" alongside the font
pipeline.

## Pipeline (maps to your 4 stages)

1. **Template generator** — paginated PDF: 5 grid pages (upper/lower case, numbers,
   special chars), 2 sentence/kerning pages, identical registration marks on every
   page, small corner glyph label, one-line instruction header per page.
2. **Capture & ingest** — upload page (name + email), registration-mark detection,
   perspective correction against the known blank template, auto levels/contrast
   (true black/white point) *before* the approval gallery, gallery with per-page
   reject/re-upload.
3. **Vectorization & font build** — each cell traced to SVG, glyphs assembled into
   TTF/OTF per page (sequential naming: "Susan's Handwriting 01," "02," …),
   sentence pages parsed for kerning pairs, automated visual validation loop,
   delivery by download link and/or email.
4. **Output engine (the plugin)** — separate track, see risk section.

## Tech stack (free/open, all mature and verifiable)

- **PDF generation**: pdf-lib or PDFKit (Node)
- **Registration/alignment**: OpenCV (server-side) — corner fiducials, homography
  warp against the blank template's known coordinates
- **Levels/contrast normalization**: OpenCV or `sharp` (Node)
- **Vectorization**: Potrace — the same bitmap-to-bezier tracer underlying most
  existing "handwriting to font" tools; free, deterministic, high precision on
  clean black/white input
- **Font assembly**: Python `fonttools`, or Node `opentype.js` + `svg2ttf` — builds
  TTF/OTF from glyph SVGs plus a kerning table
- **Natural-variation rendering**: OpenType alternate-glyph substitution
  (`calt`/rotating lookups) inside a *single* font, the same mechanism commercial
  script fonts (e.g. multi-glyph handwriting typefaces) use to avoid repeats —
  preferred over literally juggling 7 separate font files at the app level

## Known precedent

Calligraphr, iFontMaker, MyScriptFont already ship handwriting → font today. That
de-risks steps 1–3 substantially. handWriter's job is multi-source blending and
kerning fidelity on top of a known pipeline, not inventing the pipeline.

## Biggest risk: cross-app randomized output

- OpenType alternate rotation renders natively in InDesign, Illustrator, browsers
  (CSS `font-feature-settings`) — Word's OpenType feature support is limited and
  inconsistent across versions/platforms; Google Docs is browser-rendered but its
  editor doesn't expose OT feature toggles either.
- A true "type in Word and see randomized letters" result likely needs an
  app-level plugin (Office JS Add-in, Google Apps Script, or an OS-level IME/text
  service) doing character-level substitution as text is typed — not a single
  universal font trick.
- Recommendation: prove the single-font, built-in-alternation approach first
  (works in browser + Adobe apps, no plugin needed). Treat Word/GDocs/OS plugins
  as a distinct follow-on project once the font pipeline is validated.

## Hosting constraint to resolve

The existing netactiv.com deployments in this repo (see `menagerie/`) are PHP-based
(`*.php` endpoints, FTP push deploy). OpenCV, Potrace, and fonttools are not PHP —
they need a Python or Node runtime. Before building, confirm whether the netactiv
host allows shelling out to a CLI binary/Node process from PHP, or whether the
processing stage needs to run as a separate small service. This determines the
Phase 1 architecture and should get a real answer, not an assumption.

## Research still open (external, non-code)

- Kerning-capture sentence sets: no ready-made free dataset for *handwritten*
  kerning specifically. Type-design kerning test strings/pangrams exist and are a
  reasonable starting point to adapt, but need real typographic review before
  the sentence pages are finalized.

## Phases

- **Phase 0** — repo scaffold at `/handwriter/`, template PDF generator, deploy
  shell live at netactiv.com/handwriter/ (header progress bar chrome only).
- **Phase 1** — upload, registration alignment, contrast normalization, approval
  gallery. No font generation yet.
- **Phase 2** — vectorization + single font-per-page compile, download/email
  delivery, validation loop.
- **Phase 3** — multi-alphabet blending via in-font alternate-glyph rotation;
  prove natural variation in browser + Adobe apps.
- **Phase 4** — Word/Google Docs/OS plugin R&D. Separate track, likely separate
  app, scoped only after Phase 3 is real.

## Open decisions

- Backend runtime for image/font processing (depends on the PHP-vs-Node/Python
  hosting answer above).
- Email delivery service for font links (none chosen yet).
- Whether "7 fonts" is fixed or should scale with however many grid pages are
  submitted.
