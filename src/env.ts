import { z } from "zod";

const SCRIBD_DOCUMENT_URL = z.url().transform((value, context) => {
  const url = new URL(value);
  const documentId = /^\/document\/([1-9]\d*)(?:\/|$)/.exec(url.pathname)?.[1];
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "scribd.com" && !url.hostname.endsWith(".scribd.com")) ||
    url.username ||
    url.password ||
    url.port ||
    documentId === undefined
  ) {
    context.addIssue({
      code: "custom",
      message: "Expected an HTTPS Scribd document URL.",
    });
    return z.NEVER;
  }
  return { url, documentId };
});

const ENVIRONMENT = z.object({
  SCRIBD_URL: SCRIBD_DOCUMENT_URL,
  SCRIBD_BLANK_PAGES: z
    .string()
    .trim()
    .regex(/^(?:[1-9]\d*(?:\s*,\s*[1-9]\d*)*)?$/)
    .default("")
    .transform((value) => (value ? value.split(",").map(Number) : []))
    .pipe(z.array(z.number().int().positive())),
});

export function parseDocumentUrl(
  value: unknown,
): z.ZodSafeParseResult<z.output<typeof SCRIBD_DOCUMENT_URL>> {
  return SCRIBD_DOCUMENT_URL.safeParse(value);
}

export function readEnvironment(): z.ZodSafeParseResult<
  z.output<typeof ENVIRONMENT>
> {
  return ENVIRONMENT.safeParse(process.env);
}
