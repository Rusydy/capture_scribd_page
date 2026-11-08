export const USAGE =
  "Usage: npm run capture -- [--signed-in] [--interactive] [--page N | --to N | --range START END | --all]";

export interface PageSelection {
  start: number;
  end?: number;
}

function pageNumber(value: string | undefined): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error(`Invalid page number: ${value ?? "(missing)"}`);
  }
  return number;
}

export function parseSelection(args: readonly string[]): PageSelection {
  const [option, first, second] = args;
  if (option === undefined) return { start: 1, end: 1 };
  if (option === "--all" && args.length === 1) return { start: 1 };
  if (option === "--page" && args.length === 2) {
    const page = pageNumber(first);
    return { start: page, end: page };
  }
  if (option === "--to" && args.length === 2) {
    return { start: 1, end: pageNumber(first) };
  }
  if (option === "--range" && args.length === 3) {
    const start = pageNumber(first);
    const end = pageNumber(second);
    if (start > end) throw new Error("Start page must not exceed end page");
    return { start, end };
  }
  throw new Error(USAGE);
}
