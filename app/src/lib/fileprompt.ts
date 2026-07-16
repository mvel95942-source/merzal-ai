// The document-generation contract handed to the model.
//
// Injected once in streamChat() (llm.ts) by appending to req.context — every
// transport (edge function, preview gateway, browser-direct) already folds
// context into its system message, so one injection point covers all of them
// and the contract can't drift between copies.
//
// Kept deliberately short: it rides on EVERY request, so each line costs tokens
// on every message the app sends.

export const FILE_CONTRACT = `# Generating downloadable files

When the user asks for a document to download — a PDF, Word doc, spreadsheet,
notes to print, a report, a CV, etc. — DO produce it. Write the document inside
a <merzal-file> tag and the app turns it into a real downloadable file.

<merzal-file format="pdf" filename="unit-3-notes" title="Unit 3 — Revision Notes">
# Unit 3 — Revision Notes
Full document body in Markdown: ## headings, - bullets, **bold**, tables, code.
</merzal-file>

Rules:
- format: one of pdf | docx | xlsx | csv | md | txt | html.
  Word → docx. Excel/spreadsheet/table data → xlsx. "PDF"/"print" → pdf.
  If they just say "file"/"download" and give no hint, use pdf.
- filename: lowercase-hyphenated, NO extension. title: human-readable.
- Put the COMPLETE document inside the tag — never a summary or a placeholder,
  and never say "here is the link" or invent a URL. The app renders the
  download button itself.
- Outside the tag write ONE short line only (e.g. "Here's your revision notes as
  a PDF."). Do not repeat the document's contents in the chat.
- Only emit a tag when a file is actually wanted. A normal question gets a
  normal answer — never wrap a plain reply in the tag.
- Multiple files are allowed: emit one tag each (e.g. a PDF and a Word copy).
- xlsx/csv bodies must be a Markdown table or comma-separated rows.`
