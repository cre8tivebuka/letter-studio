# Letter Studio

**Built by cre8tivebuka**

Turn an empty PDF letterhead and your words into one finished PDF.

- Upload an empty PDF letterhead.
- Type, paste, or import a Word (.docx) letter.
- Format your letter and add your own static TTF/OTF fonts.
- Resize or move the writing area directly on the preview.
- Download all pages together as one compact PDF.

The app runs entirely in the browser. There are no accounts, social sign-in, or server document uploads. Documents and fonts are cleared when the page closes or refreshes.

## Run locally

Use Node.js 24 (or a supported Node version at least 22.13).

    npm ci
    npm run dev

Open the address printed by Vite.

    npm run typecheck
    npm run build
    npm run preview

Build output is in dist/. No application credentials or backend service is required.

## GitHub deployment

GitHub is the source of truth for this project:

- Repository: https://github.com/cre8tivebuka/letter-studio
- Website: https://cre8tivebuka.github.io/letter-studio/

The Build and deploy Letter Studio workflow checks types and builds every pull request and push to main. Main builds deploy to GitHub Pages automatically. GitHub Pages must use **GitHub Actions** as its source.

CI sets VITE_BASE_PATH=/letter-studio/ so the logo, fonts, PDF worker, and application assets work at the project's URL. Set VITE_BASE_PATH=/ when deploying to a domain root.

## Working with letters

Only the first page of the uploaded letterhead is repeated on each output page. Word import extracts text; apply your preferred formatting in the editor.

Select **Adjust writing area** above the preview. Drag an edge or corner to resize the box, or drag inside it to move it. The sliders and preview stay synchronized. Arrow keys nudge a focused handle; Shift makes larger adjustments. Controls are excluded from the downloaded PDF.

**Add fonts** accepts static TTF/OTF files up to 5 MB or direct HTTPS file links that allow browser access. Use fonts that permit PDF embedding. Fonts are embedded in the exported document; variable fonts and WOFF files are not supported.

Letters support up to 30 pages and 100,000 characters. PDFs are compressed below 1 MB with vector text. Very complex letterhead artwork can require reduced image quality; the app reports an error if it cannot meet the size limit.

## Browser regression checks

Install Playwright separately for development, or set LETTER_STUDIO_TEST_RUNTIME to a directory whose node_modules provides Playwright. Tests use Chromium by default; set LETTER_STUDIO_TEST_CHANNEL=msedge to use Microsoft Edge.

Start npm run preview:interface, then run:

    node tests/simple-flow-browser.mjs
    node tests/preview-resize-browser.mjs

Set LETTER_STUDIO_TEST_URL to test a different preview or the GitHub Pages deployment.
