# Liberation Sans

Used to embed a Unicode-capable font in generated PDFs.

jsPDF's built-in Helvetica is encoded as WinAnsi (single byte), so any codepoint
outside Latin-1 is truncated to a byte and renders as mojibake — `6CO₂ + 6H₂O →`
came out as `6 C O ‚+ 6 H ‚ O!’`. Liberation Sans is embedded instead: it covers
Greek, arrows and mathematical operators, and is metric-compatible with
Helvetica/Arial so the layout is unchanged.

Files are copied from the `pdfjs-dist` package (`standard_fonts/`), which is
already a dependency. They are vendored here rather than imported from
`node_modules/pdfjs-dist/...` so that PDF generation does not depend on another
package's internal directory layout.

Loaded as URL assets (`?url`) and fetched only when a PDF is actually built, so
they never touch the app's initial load.

## License

Copyright (c) 2012 Red Hat, Inc.
Liberation is a trademark of Red Hat, Inc.

Licensed under the SIL Open Font License, Version 1.1.
<https://openfontlicense.org>

This Font Software is licensed under the SIL Open Font License, Version 1.1.
This license is copied below, and is also available with a FAQ at
<https://openfontlicense.org>

Permission is hereby granted, free of charge, to any person obtaining a copy of
the Font Software, to use, study, copy, merge, embed, modify, redistribute, and
sell modified and unmodified copies of the Font Software, subject to the terms
of the SIL Open Font License. The fonts, including any derivative works, can be
bundled, embedded, redistributed and/or sold with any software provided that any
reserved names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license.
