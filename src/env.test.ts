import { describe, expect, it } from "vitest";
import { parseDocumentUrl } from "./env.ts";

interface InvalidDocumentUrl {
  name: string;
  value: unknown;
}

const INVALID_DOCUMENT_URLS: readonly InvalidDocumentUrl[] = [
  { name: "missing", value: undefined },
  {
    name: "a lookalike host",
    value: "https://scribd.com.example.org/document/42",
  },
  { name: "insecure", value: "http://www.scribd.com/document/42" },
  { name: "a different route", value: "https://www.scribd.com/book/42" },
];

describe("parseDocumentUrl", () => {
  it("reads a document identifier from a localized Scribd URL", () => {
    expect(
      parseDocumentUrl("https://id.scribd.com/document/42/test"),
    ).toMatchObject({
      success: true,
      data: { documentId: "42" },
    });
  });

  it.each(INVALID_DOCUMENT_URLS)("rejects $name", ({ value }) => {
    expect(parseDocumentUrl(value).success).toBe(false);
  });
});
