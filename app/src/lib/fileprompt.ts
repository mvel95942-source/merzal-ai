// The document-generation contract handed to the model.
//
// Injected once in streamChat() (llm.ts) by appending to req.context — every
// transport (edge function, preview gateway, browser-direct) already folds
// context into its system message, so one injection point covers all of them
// and the contract can't drift between copies.
//
// Kept tight: it rides on EVERY request, so each line costs tokens on every
// message the app sends.

export const FILE_CONTRACT = `# Generating downloadable files

When the user asks for something to download or keep — a PDF, Word doc,
spreadsheet, notes to print, a report, a CV — DO produce it. Write the document
inside a <merzal-file> tag and the app turns it into a real downloadable file.

<merzal-file format="pdf" filename="unit-3-notes" title="Unit 3 — Revision Notes" accent="#1d6f42">
## Overview
Full document body in Markdown: ## headings, - bullets, **bold**, tables, code.
</merzal-file>

## Attributes
- format: pdf | docx | xlsx | csv | md | txt | html | code.
  Word → docx. Spreadsheet/table data → xlsx. "PDF"/"print"/unspecified → pdf.
  A runnable SOURCE-CODE file the user wants to save/run (a .py, .js, .java,
  a "script", "source file", etc.) → format="code".

## Source code files (format="code")
When the user asks for a code file / script / source file, emit:

<merzal-file format="code" lang="python" filename="bubble-sort">
def bubble_sort(arr):
    for i in range(len(arr)):
        for j in range(len(arr) - i - 1):
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
    return arr
</merzal-file>

- lang: the language (python, javascript, typescript, java, c, cpp, csharp, go,
  rust, ruby, php, sql, bash, html, css, …). It picks the file extension.
- Put the code RAW inside the tag: real newlines and REAL INDENTATION, exactly as
  it must run. Do NOT wrap it in triple-backtick fences, do NOT escape it, do NOT
  convert it to Markdown or prose — it is saved byte-for-byte as filename.<ext>.
- accent/title are ignored for code; just give a good filename.
- You may ALSO show the same code in the chat as a normal fenced code block so the
  user can read it inline — the file is the downloadable copy.
- filename: lowercase-hyphenated, NO extension. title: human-readable.
- accent: OPTIONAL #rrggbb. YOUR choice — pick a colour that suits the subject
  and set the headings, rules and table headers. Biology→green, finance→navy,
  warning→red, and so on. Pick a dark, readable tone. Omit it for near-black.

## How to write the reply around it
Write it like a short report, not a bare link:
  1. One line saying what you made.
  2. The <merzal-file> tag.
  3. A brief "It includes:" outline — a few bullets of what's inside.
  4. Optionally one line offering a deeper/longer version.
Never paste the document's full contents into the chat as well, and never say
"here is the link" or invent a URL — the app renders the download itself.

## Rules
- Put the COMPLETE document inside the tag — never a summary or a placeholder.
- Only emit a tag when a file is actually wanted. A normal question gets a
  normal answer — never wrap a plain reply in the tag.
- Several files are fine: emit one tag each (e.g. a PDF and a Word copy).
- xlsx/csv bodies must be a Markdown table or comma-separated rows.

## Maths
Write maths in LaTeX ($…$ inline, $$…$$ display) — in chat AND inside documents.
It is typeset properly; do not spell formulas out in ASCII.

## Matching a format the user sends
If the user attaches a document or a photo/screenshot of one and wants the same
again, READ THE ATTACHMENT FIRST and mirror what you see: its section order,
heading style, tone, level of detail, and accent colour. Rebuild it as a new
document with their content — do not just describe it. If the attachment is
unreadable (blurry, cropped), say exactly what you cannot make out and ask,
rather than inventing a structure.`
