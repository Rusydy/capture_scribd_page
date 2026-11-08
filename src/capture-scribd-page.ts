import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";
import { launch, type Page } from "puppeteer-core";
import { parseDocumentUrl, readEnvironment } from "./env.ts";
import { parseSelection } from "./selection.ts";
import {
  capturePage,
  readPageCount,
  ScribdPageUnavailableError,
} from "./scribd-viewer.ts";

const CHROME_APP = "/Applications/Google Chrome.app";
const CHROME_PATH = join(CHROME_APP, "Contents/MacOS/Google Chrome");
const OUTPUT_DIR = fileURLToPath(new URL("../output/", import.meta.url));
const PROFILE_DIR = fileURLToPath(
  new URL("../.chrome-profile/", import.meta.url),
);

async function writeOutput(path: string, bytes: Uint8Array) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function signIn() {
  await mkdir(PROFILE_DIR, { recursive: true, mode: 0o700 });
  console.log(
    "Sign in to Scribd in Chrome, then quit that Chrome instance with Command-Q.",
  );
  // The identity provider requires a browser the user controls during login.
  await promisify(execFile)("/usr/bin/open", [
    "-n",
    "-W",
    "-a",
    CHROME_APP,
    "--args",
    `--user-data-dir=${PROFILE_DIR}`,
    "https://www.scribd.com/",
  ]);
}

async function captureWhenReadable(
  page: Page,
  pageNumber: number,
  { allowBlank }: { allowBlank: boolean },
) {
  try {
    return await capturePage(page, pageNumber, { allowBlank });
  } catch (error) {
    if (!(error instanceof ScribdPageUnavailableError)) throw error;

    console.log(
      `Waiting for page ${pageNumber}. Complete any Scribd prompt in Chrome. Capture resumes when the page is fully visible. Press Control-C to stop.`,
    );
    return capturePage(page, pageNumber, { waitForReadable: true, allowBlank });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const [option] = args;
  if (option === "--sign-in" && args.length === 1) {
    await signIn();
    return;
  }

  const usesSavedProfile = option === "--signed-in";
  const captureArgs = usesSavedProfile ? args.slice(1) : args;
  const isInteractive = captureArgs[0] === "--interactive";
  const selection = parseSelection(
    isInteractive ? captureArgs.slice(1) : captureArgs,
  );
  const environment = readEnvironment();
  if (!environment.success) {
    throw new Error("Check SCRIBD_URL and SCRIBD_BLANK_PAGES in .env.", {
      cause: environment.error,
    });
  }

  const { url, documentId } = environment.data.SCRIBD_URL;
  if (usesSavedProfile)
    await mkdir(PROFILE_DIR, { recursive: true, mode: 0o700 });
  const browser = await launch({
    executablePath: CHROME_PATH,
    headless: !isInteractive,
    userDataDir: usesSavedProfile ? PROFILE_DIR : undefined,
    // A profile created by regular Chrome uses the macOS Keychain.
    ignoreDefaultArgs: usesSavedProfile
      ? ["--password-store=basic", "--use-mock-keychain"]
      : undefined,
    defaultViewport: { width: 1280, height: 1800, deviceScaleFactor: 2 },
    protocolTimeout: 30_000,
  });

  try {
    const page = await browser.newPage();
    const response = await page.goto(url.href, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    const viewerUrl = page.url();
    const current = parseDocumentUrl(viewerUrl);
    // A revalidated document can render from Chrome's cache after HTTP 304.
    const hasViewerResponse =
      response !== null && (response.ok() || response.status() === 304);
    if (
      !current.success ||
      current.data.documentId !== documentId ||
      !hasViewerResponse
    ) {
      const host = new URL(viewerUrl).hostname || "local browser page";
      const status =
        response === null ? "no HTTP response" : `HTTP ${response.status()}`;
      throw new Error(
        `Could not open Scribd document ${documentId}. Chrome reached ${host} (${status}).`,
      );
    }

    const consent = await page.$(
      'button[aria-label="Close this consent banner"]',
    );
    if (consent !== null) {
      try {
        if (await consent.isVisible()) await consent.click();
      } finally {
        await consent.dispose();
      }
    }

    const capture = isInteractive ? captureWhenReadable : capturePage;
    const total = await readPageCount(page);
    const end = selection.end ?? total;
    if (end > total) throw new Error(`Choose a page within 1–${total}.`);

    const blankPages = new Set(environment.data.SCRIBD_BLANK_PAGES);
    const outputDir = join(OUTPUT_DIR, documentId);
    const pdf = await PDFDocument.create();
    for (let pageNumber = selection.start; pageNumber <= end; pageNumber += 1) {
      const screenshot = await capture(page, pageNumber, {
        allowBlank: blankPages.has(pageNumber),
      });
      await mkdir(outputDir, { recursive: true });
      await writeOutput(join(outputDir, `page-${pageNumber}.jpg`), screenshot);

      const image = await pdf.embedJpg(screenshot);
      const pdfPage = pdf.addPage([image.width * 0.375, image.height * 0.375]);
      pdfPage.drawImage(image, {
        x: 0,
        y: 0,
        width: pdfPage.getWidth(),
        height: pdfPage.getHeight(),
      });
      console.log(`Captured page ${pageNumber} of ${total}`);
    }

    const filename =
      selection.start === end
        ? `page-${end}.pdf`
        : `pages-${selection.start}-${end}.pdf`;
    const output = join(outputDir, filename);
    await writeOutput(output, await pdf.save());
    console.log(`Saved ${output}`);
  } finally {
    await browser.close();
  }
}

try {
  await main();
} catch (error) {
  console.error("Capture failed.", error);
  process.exitCode = 1;
}
