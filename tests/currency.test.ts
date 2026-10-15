import { describe, expect, it } from "vitest";
import {
  aedRateFor,
  convertCurrency,
  CURRENCIES,
  fractionDigitsFor,
  fromAed,
  GCC_CURRENCY_CODES,
  isGccCurrency,
  normalizeCurrency,
  roundMoney,
  toAed,
} from "@/lib/currency";
import { formatCurrency } from "@/lib/format";

describe("GCC currency registry", () => {
  it("covers exactly the six GCC currencies in AED-first order", () => {
    expect(GCC_CURRENCY_CODES).toEqual(["AED", "SAR", "KWD", "QAR", "BHD", "OMR"]);
    expect(Object.keys(CURRENCIES).sort()).toEqual([...GCC_CURRENCY_CODES].sort());
  });

  it("matches the mobile app's country → currency mapping", () => {
    expect(CURRENCIES.AED.country).toBe("AE");
    expect(CURRENCIES.SAR.country).toBe("SA");
    expect(CURRENCIES.KWD.country).toBe("KW");
    expect(CURRENCIES.QAR.country).toBe("QA");
    expect(CURRENCIES.BHD.country).toBe("BH");
    expect(CURRENCIES.OMR.country).toBe("OM");
  });

  it("uses 3 decimals for the three dinar/rial currencies", () => {
    expect(fractionDigitsFor("KWD")).toBe(3);
    expect(fractionDigitsFor("BHD")).toBe(3);
    expect(fractionDigitsFor("OMR")).toBe(3);
    expect(fractionDigitsFor("AED")).toBe(2);
    expect(fractionDigitsFor("SAR")).toBe(2);
    expect(fractionDigitsFor("QAR")).toBe(2);
    expect(fractionDigitsFor("USD")).toBe(2); // unknown → default
  });
});

describe("normalizeCurrency", () => {
  it("uppercases, trims and defaults blank input to AED", () => {
    expect(normalizeCurrency("sar")).toBe("SAR");
    expect(normalizeCurrency("  kwd ")).toBe("KWD");
    expect(normalizeCurrency("")).toBe("AED");
    expect(normalizeCurrency(null)).toBe("AED");
    expect(normalizeCurrency(undefined)).toBe("AED");
  });

  it("detects GCC codes only", () => {
    expect(isGccCurrency("SAR")).toBe(true);
    expect(isGccCurrency("sar")).toBe(true);
    expect(isGccCurrency("USD")).toBe(false);
    expect(isGccCurrency(null)).toBe(false);
  });
});

describe("conversion", () => {
  it("keeps AED identity", () => {
    expect(toAed(1234.56, "AED")).toBe(1234.56);
    expect(convertCurrency(100, "AED", "AED")).toBe(100);
  });

  it("converts SAR at the pegged cross rate (3.6725 / 3.75)", () => {
    // 100 SAR → 97.9333... AED
    expect(toAed(100, "SAR")).toBeCloseTo(97.9333, 3);
    // and back
    expect(fromAed(toAed(100, "SAR"), "SAR")).toBeCloseTo(100, 6);
  });

  it("converts the three high-value currencies (KWD/BHD/OMR) at > 1 AED", () => {
    expect(aedRateFor("BHD")).toBeCloseTo(9.7673, 3);
    expect(aedRateFor("OMR")).toBeCloseTo(9.5514, 3);
    expect(aedRateFor("KWD")).toBeGreaterThan(9);
    expect(toAed(1, "BHD")).toBeGreaterThan(toAed(1, "AED"));
  });

  it("round-trips every GCC currency through AED", () => {
    for (const code of GCC_CURRENCY_CODES) {
      expect(fromAed(toAed(1000, code), code)).toBeCloseTo(1000, 6);
    }
  });

  it("agrees between the two-hop and direct conversion paths", () => {
    for (const from of GCC_CURRENCY_CODES) {
      for (const to of GCC_CURRENCY_CODES) {
        // Direct cross = via AED pivot; both must give the same number.
        const viaAed = fromAed(toAed(500, from), to);
        expect(viaAed).toBeCloseTo((500 * aedRateFor(from)) / aedRateFor(to), 9);
      }
    }
  });

  it("passes unknown currencies through untouched", () => {
    expect(convertCurrency(50, "USD", "AED")).toBe(50);
    expect(toAed(50, "USD")).toBe(50);
  });

  it("roundMoney keeps two decimals", () => {
    expect(roundMoney(10.999)).toBe(11);
    expect(roundMoney(1234.5678)).toBe(1234.57);
    expect(roundMoney(0.001)).toBe(0);
  });
});

describe("formatCurrency", () => {
  it("formats AED amounts", () => {
    expect(formatCurrency(1250)).toContain("1,250");
    expect(formatCurrency(1250, "AED")).toContain("AED");
  });

  it("formats each GCC currency without throwing", () => {
    for (const code of GCC_CURRENCY_CODES) {
      expect(formatCurrency(1234.56, code)).toContain(code);
    }
  });

  it("keeps 3 decimals for KWD/BHD/OMR when the amount has fractions", () => {
    expect(formatCurrency(12.345, "KWD")).toContain("12.345");
    expect(formatCurrency(12.345, "BHD")).toContain("12.345");
    expect(formatCurrency(12.345, "OMR")).toContain("12.345");
    // AED/SAR/QAR keep 2
    expect(formatCurrency(12.345, "AED")).toContain("12.35");
  });

  it("drops decimals for whole amounts (compact console style)", () => {
    expect(formatCurrency(1250, "SAR")).not.toContain(".00");
  });

  it("never throws on an invalid currency code", () => {
    expect(() => formatCurrency(10, "NOT_A_CODE")).not.toThrow();
    expect(formatCurrency(10, "NOT_A_CODE")).toContain("NOT_A_CODE");
    expect(formatCurrency(null, "KWD")).toContain("KWD");
  });
});
