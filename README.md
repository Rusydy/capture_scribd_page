# Capture Scribd Pages

Save selected pages from Scribd's document viewer as JPGs and one image-based PDF. Use this CLI for pages visible to your browser session when you have permission to reproduce them. Scribd's Download control can provide the original file when available.

Requires Node.js 22.14+ and Google Chrome installed in `/Applications` on macOS.

```sh
npm ci
cp .env.example .env
# Set SCRIBD_URL to the Scribd document URL in .env.
npm run capture
npm run capture -- --page 3
npm run capture -- --to 5
npm run capture -- --range 3 5
npm run capture -- --all
```

With no arguments, the CLI captures page 1. Outputs go to `output/<document-id>/`. A run writes `page-N.jpg` for each captured page and publishes `page-N.pdf` or `pages-START-END.pdf` after every requested page succeeds. If the viewer blocks or fails to render a page, the CLI exits with an error. JPGs from earlier pages may remain. An existing complete PDF stays in place if a rerun fails.

Some documents have blank pages that Scribd renders without a content layer. In `--interactive` mode the CLI accepts such a page after waiting about 10 seconds for content, if Scribd marks it as blank. It prints `Page N is blank.` when that happens. To skip the wait, or to capture blank pages outside `--interactive` mode, list them in `SCRIBD_BLANK_PAGES` as comma-separated page numbers. For BPR Spacy, use `SCRIBD_BLANK_PAGES=2`. The viewer still has to unlock and display each listed page before capture.

## Sign in to Scribd

Run `npm run sign-in` to open regular Chrome with the dedicated profile. Use Scribd's Sign in button and complete the login in Chrome. When Scribd shows you are signed in, quit that Chrome instance with **Command-Q**. The sign-in command waits for Chrome to quit before the profile can be used for capture. Repeat this step if the session expires.

```sh
npm run sign-in
npm run capture -- --signed-in --page 1
npm run capture -- --signed-in --range 3 5
```

Use `--signed-in` before any page-selection flag to reuse the saved session. The profile lives in the Git-ignored `.chrome-profile/` directory and contains local session data. Ordinary captures use a fresh browser session. For a document that Scribd unlocks in batches after an ad, add `--interactive` to open a visible Chrome window and pause when a page is locked or takes too long to become readable.

```sh
npm run capture -- --signed-in --interactive --all
```

Quit the Chrome instance from `npm run sign-in` before starting the capture. Do not run two captures, or leave another Chrome open, on the same `.chrome-profile/`. If Scribd shows an "Unlock this document" prompt, click **Skip ad** in the capture window. Do not click **Continue for free**, which reloads the viewer and ends the run. The CLI waits and resumes automatically once the requested page is fully visible, including after the viewer reloads. If a sticky toolbar covers the top of a page, the CLI scrolls the page below it before capture. Press Control-C to stop.

A failed `--all` run publishes no PDF, so for a long document you can capture it in ranges, such as `--range 1 50`, and join the PDFs afterwards. On macOS, `caffeinate -i` in front of the command keeps the Mac awake during a long run.

```sh
npm run ci
```

Based on [capture_drive_page](https://github.com/Rusydy/capture_drive_page).
