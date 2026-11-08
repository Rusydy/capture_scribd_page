import { setTimeout as delay } from "node:timers/promises";
import {
  TimeoutError,
  type ElementScreenshotOptions,
  type Page,
} from "puppeteer-core";

const PAGE_INPUT = '[data-e2e="page-number-entry"]';
const TOTAL_PAGES = '[data-e2e="total-pages"]';
const VIEWER_TIMEOUT = 15_000;

export async function readPageCount(page: Page): Promise<number> {
  const counter = await page.waitForSelector(TOTAL_PAGES, {
    visible: true,
    timeout: VIEWER_TIMEOUT,
  });
  if (counter === null) throw new Error("Scribd page counter is missing.");

  try {
    const total = await counter.evaluate((element) =>
      Number(element.textContent),
    );
    if (!Number.isSafeInteger(total) || total < 1) {
      throw new Error("Scribd page count is invalid.");
    }
    return total;
  } finally {
    await counter.dispose();
  }
}

interface CapturePageOptions {
  waitForReadable?: boolean;
  allowBlank?: boolean;
}

function inspectPage(
  pageNumber: number,
  {
    reportPageChange = false,
    allowBlank = false,
    scrollPastToolbar = false,
  }: {
    reportPageChange?: boolean;
    allowBlank?: boolean;
    scrollPastToolbar?: boolean;
  } = {},
) {
  const outer = document.getElementById(`outer_page_${pageNumber}`);
  if (outer?.classList.contains("blurred_page")) return "restricted";

  const content = document.getElementById(`page${pageNumber}`);
  if (!outer || !content || !outer.contains(content)) return false;

  const currentPage = document
    .querySelector('[data-e2e="total-pages"]')
    ?.previousElementSibling?.textContent?.match(/\d+\s*$/)?.[0];
  if (Number(currentPage) !== pageNumber) {
    return reportPageChange && currentPage ? "different-page" : false;
  }
  if (
    outer.classList.contains("not_visible") ||
    document.fonts.status !== "loaded"
  ) {
    return false;
  }

  const images = [
    ...content.querySelectorAll<HTMLImageElement>(".image_layer img[src]"),
  ];
  // The rendered text layer can be empty on an intentionally blank page.
  if (
    (images.length === 0 &&
      !content.querySelector(".text_layer") &&
      !(allowBlank && content.classList.contains("newpage"))) ||
    images.some((image) => !image.complete || image.naturalWidth === 0)
  ) {
    return false;
  }

  const { left, top, right, bottom, width, height } =
    content.getBoundingClientRect();
  if (
    width < 2 ||
    height < 2 ||
    left < 0 ||
    top < 0 ||
    right > innerWidth ||
    bottom > innerHeight
  ) {
    return false;
  }

  // After a jump, Scribd's sticky toolbar can sit on top of the page's first pixels.
  if (scrollPastToolbar) {
    const hit = document.elementFromPoint(left + width / 2, top + 1);
    if (hit !== null && !outer.contains(hit)) {
      for (let el: Element | null = hit; el; el = el.parentElement) {
        const { position } = getComputedStyle(el);
        if (position !== "sticky" && position !== "fixed") continue;
        const { bottom: toolbarBottom } = el.getBoundingClientRect();
        if (toolbarBottom > top && toolbarBottom - top < 200) {
          scrollBy(0, top - toolbarBottom - 2);
          return false;
        }
        break;
      }
    }
  }

  // Check the page edges and center for sticky controls or a dialog over the page.
  for (const x of [left + 1, left + width / 2, right - 1]) {
    for (const y of [top + 1, top + height / 2, bottom - 1]) {
      const hit = document.elementFromPoint(x, y);
      if (hit === null || !outer.contains(hit)) return false;
    }
  }
  return "ready";
}

export class ScribdPageUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ScribdPageUnavailableError";
  }
}

async function jumpToPage(page: Page, pageNumber: number) {
  const input = await page.waitForSelector(PAGE_INPUT, {
    visible: true,
    timeout: VIEWER_TIMEOUT,
  });
  if (input === null) throw new Error("Scribd page jump control is missing.");

  try {
    await input.click({ clickCount: 3 });
    await input.type(String(pageNumber));
    await input.press("Enter");
  } finally {
    await input.dispose();
  }
}

const JUMP_COOLDOWN = 3_000;
// A blank page has no content to wait for. After this long, accept an empty page.
const BLANK_GRACE = 10_000;

function isNavigationError(error: unknown): boolean {
  return (
    error instanceof Error &&
    /detached Frame|Execution context was destroyed/.test(error.message)
  );
}

// Scribd reloads the viewer when an ad unlocks pages. Treat that as "not ready yet".
async function inspectWhileWaiting(
  page: Page,
  pageNumber: number,
  allowBlank: boolean,
) {
  try {
    return await page.evaluate(inspectPage, pageNumber, {
      reportPageChange: true,
      allowBlank,
      scrollPastToolbar: true,
    });
  } catch (error) {
    if (isNavigationError(error)) return false;
    throw error;
  }
}

export async function capturePage(
  page: Page,
  pageNumber: number,
  { waitForReadable = false, allowBlank = false }: CapturePageOptions = {},
): Promise<Uint8Array> {
  try {
    if (!waitForReadable) await jumpToPage(page, pageNumber);

    let acceptBlank = allowBlank;
    if (waitForReadable) {
      // Poll from Node so the ad wait doesn't hold a single Chrome protocol call open.
      let lastJumpAt = 0;
      const waitStartedAt = Date.now();
      for (;;) {
        if (Date.now() - waitStartedAt > BLANK_GRACE) acceptBlank = true;
        const status = await inspectWhileWaiting(page, pageNumber, acceptBlank);
        if (status === "ready") {
          if (acceptBlank && !allowBlank) {
            const isBlank = await page.evaluate(
              (n) =>
                document
                  .getElementById(`page${n}`)
                  ?.classList.contains("newpage"),
              pageNumber,
            );
            if (isBlank) console.log(`Page ${pageNumber} is blank.`);
          }
          break;
        }
        if (
          status === "different-page" &&
          Date.now() - lastJumpAt > JUMP_COOLDOWN
        ) {
          lastJumpAt = Date.now();
          try {
            await jumpToPage(page, pageNumber);
          } catch (error) {
            // An ad can hide the page box or reload the viewer. Try again later.
            if (!(error instanceof TimeoutError || isNavigationError(error))) {
              throw error;
            }
          }
        }
        await delay(500);
      }
    } else {
      const state = await page.waitForFunction(
        inspectPage,
        { timeout: VIEWER_TIMEOUT, polling: 250 },
        pageNumber,
        { allowBlank, scrollPastToolbar: true },
      );
      const status = await state.jsonValue();
      await state.dispose();
      if (status === "restricted") {
        throw new ScribdPageUnavailableError(
          `Scribd restricts access to page ${pageNumber}.`,
        );
      }
    }

    const element = await page.$(`#page${pageNumber}`);
    if (element === null)
      throw new Error(`Scribd page ${pageNumber} disappeared.`);

    try {
      const screenshotOptions: ElementScreenshotOptions = {
        type: "jpeg",
        quality: 95,
        scrollIntoView: false,
        captureBeyondViewport: false,
      };
      const screenshot = await element.screenshot(screenshotOptions);
      if (
        (await page.evaluate(inspectPage, pageNumber, {
          allowBlank: acceptBlank,
        })) !== "ready"
      ) {
        throw new Error(
          `Scribd page ${pageNumber} changed while being captured.`,
        );
      }
      return screenshot;
    } finally {
      await element.dispose();
    }
  } catch (error) {
    if (!(error instanceof TimeoutError)) throw error;
    throw new ScribdPageUnavailableError(
      `Scribd page ${pageNumber} did not become fully visible and readable. Check viewer access and page rendering.`,
      { cause: error },
    );
  }
}
