import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("quotes and escapes", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(12)).toBe('"12"');
  });

  it.each(['=HYPERLINK("x")', "+1+1", "-2", "@SUM(A1)", "\tx"])("neutralizes formula %s", (v) => {
    expect(csvCell(v).startsWith(`"'`)).toBe(true);
  });

  it("builds rows with a BOM and CRLF", () => {
    expect(toCsv(["a"], [["b"]])).toBe('﻿"a"\r\n"b"\r\n');
  });
});
