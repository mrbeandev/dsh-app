# Third-party notices

This project’s UI is adapted from the design tokens and screen patterns of T3 Code mobile, and its Harness client is informed by the protocol documentation and functionality of DeepSeek Harness Mobile. Both projects use the MIT license. Full notices are retained alongside this document:

| Project | Copyright | License |
| --- | --- | --- |
| [T3 Code mobile](https://github.com/pingdotgg/t3code/tree/main/apps/mobile) | Copyright (c) 2026 T3 Tools Inc. | [MIT](licenses/t3code-MIT.txt) |
| [DeepSeek Harness Mobile](https://github.com/sorsama/deepseek-harness-mobile) | Copyright (c) 2026 DSH Mobile contributors | [MIT](licenses/deepseek-harness-mobile-MIT.txt) |

No affiliation or endorsement is implied. Upstream logos, names, service access, or trademarks are not licensed by the MIT software license. The app uses its own DSH name rather than T3 branding. Package dependencies retain their own licenses; consult their distributed package notices before shipping binaries.

## Bundled viewer libraries

These are embedded (as generated modules in `src/web-assets/`, produced by `scripts/build-web-assets.mjs`) so the terminal and file viewers work offline:

| Library | Version | License |
| --- | --- | --- |
| [xterm.js](https://github.com/xtermjs/xterm.js) `@xterm/xterm`, `@xterm/addon-fit` | 5.5.0, 0.11.0 | MIT |
| [PDF.js](https://github.com/mozilla/pdf.js) `pdfjs-dist` | 4.10.38 | Apache-2.0 |
| [SheetJS](https://sheetjs.com) `xlsx` | 0.18.5 | Apache-2.0 |
