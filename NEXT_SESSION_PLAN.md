# Next session plan — Merzal AI

Ordered by value. Each item has scope, approach, and a definition of done.

## 1. AI document generation (PPT / Excel / PDF / DOC) with download link  ★ headline

**Goal:** the user asks "make me a PPT on X / an Excel budget / a PDF report /
a Word doc", the AI produces a real file and the chat shows a **Download** button.

**Approach (client-side generation, plug-and-play behind one interface):**
- Add a `DocGenProvider` interface in `lib/docgen.ts`:
  `generate(kind, spec) → Blob` for `kind ∈ {pptx, xlsx, pdf, docx, csv}`.
- Libraries (all browser-capable): `pptxgenjs` (PPTX), `xlsx`/SheetJS (XLSX/CSV),
  `jspdf` + `jspdf-autotable` (PDF), `docx` (DOCX). Lazy-`import()` per kind so the
  main bundle stays small.
- **Structured model output:** add a system instruction so that when a document is
  requested, the model returns a fenced ```` ```merzal-doc ```` block of JSON
  (`{ kind, title, slides|sheets|sections }`). Parse it, hide the raw JSON in the
  chat, render a "📄 title — Download .pptx" card instead.
- `streamChat` already streams; detect the doc block at finish, build the Blob,
  `URL.createObjectURL`, render a DocCard with download.
- **Schema per kind:** slides = `[{title, bullets[], notes?}]`; sheets =
  `[{name, rows[][]}]`; pdf/docx = `[{heading, paragraphs[], table?}]`.

**Definition of done:** "make a 5-slide PPT on photosynthesis" downloads a valid
.pptx that opens in PowerPoint; same for xlsx/pdf/docx. No fake files.

**Risks:** model JSON reliability → validate + repair-prompt once on parse failure;
keep a "Download as PDF/Text" fallback from the plain answer.

## 2. Document *reading* / extraction (PDF/DOCX/XLSX/PPTX upload)

Pair with #1's libs (read side). `pdfjs-dist` (PDF text), `mammoth` (DOCX→text),
SheetJS (XLSX→CSV text), `pptxgenjs`/JSZip (PPTX text). Wire into
`attachments.ts` so the existing upload path sends real extracted text.
**Done:** upload a PDF, ask about it, model answers from its contents.

## 3. Uploads through the production edge-function gateway

Today vision works only in the preview (browser-direct) path. Update the `chat`
edge function to accept `attachments` and build the multimodal `image_url`/text
parts server-side, so prod (real auth) gets vision too.
**Done:** logged-in user (not preview) can upload an image and get a vision answer.

## 4. Conversation summarization for long chats

Replace the last-24-turns truncation: when a chat exceeds N turns, summarize the
older turns into a running summary stored on the chat and inject that + recent
turns. **Done:** a 100-message chat still answers with early context, lower tokens.

## 5. Usage-limit / quota handling

- Surface quota/rate-limit (429) as a friendly inline notice (already partial) and
  add a small retry-with-backoff on the streaming call.
- Support multiple keys / model fallback (e.g. gemma-4-31b → gemma-4-26b → 2.5-flash)
  via env so a single quota wall doesn't block chat.
- Optional: per-user daily cap recorded in Postgres (the SECURITY backlog item).

## 6. QA pass with gstack

Run the `/gstack` headless-browser skill against the running app for a structured
QA sweep (login, send, edit/regenerate, share, continue-from-share, uploads,
mobile breakpoints) and fix what it surfaces. Treat its findings as the regression
checklist before any deploy.

## 7. Polish carried over

- Image persistence in history (store to Supabase Storage; show thumbnails on reload).
- Bundle code-splitting (lazy-load KaTeX + docgen libs) to cut first-paint size.
- Password reset / "forgot password" flow for students.
