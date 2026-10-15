import { describe, expect, it } from "vitest";
import {
  collectionCurrencyResolver,
  computeGccStats,
  computeGccCurrencyStats,
  countryForCollection,
  countryForDocument,
  countryFromCode,
  countryFromLocation,
  currencyForCountry,
  GCC_COUNTRIES,
  GCC_COUNTRY_LABELS,
  isGccCountryCode,
  transactionCurrencyResolver,
} from "@/lib/gcc";
import { resolveRowCurrency } from "@/lib/currency";
import type { Collection, Document, FinanceTransaction } from "@/lib/types";

function collection(partial: Partial<Collection> = {}): Collection {
  return {
    id: partial.id ?? "c1",
    owner_id: partial.owner_id ?? "u1",
    name: partial.name ?? "Workspace",
    is_personal: partial.is_personal ?? false,
    created_at: partial.created_at ?? "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function doc(partial: Partial<Document> = {}): Document {
  return {
    id: partial.id ?? "d1",
    owner_id: partial.owner_id ?? "u1",
    collection_id: partial.collection_id ?? null,
    doc_type: "passport",
    display_name: "Passport",
    expires_at: partial.expires_at ?? null,
    reminder_days: 30,
    status: partial.status ?? "active",
    assigned_to: null,
    renewal_fee: null,
    notes: null,
    file_name: null,
    file_path: null,
    file_size: null,
    location: partial.location ?? null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

function tx(partial: Partial<FinanceTransaction> = {}): FinanceTransaction {
  return {
    id: partial.id ?? "t1",
    owner_id: partial.owner_id ?? "u1",
    collection_id: partial.collection_id ?? null,
    kind: partial.kind ?? "expense",
    category: partial.category ?? "rent",
    title: partial.title ?? "bill",
    amount: partial.amount ?? 100,
    currency: partial.currency ?? "AED",
    occurred_at: partial.occurred_at ?? "2026-09-01",
    note: null,
    document_id: null,
    created_at: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("GCC country metadata", () => {
  it("lists the six member states with the mobile app's labels", () => {
    expect(GCC_COUNTRIES.map((c) => c.code)).toEqual(["AE", "SA", "KW", "QA", "BH", "OM"]);
    expect(GCC_COUNTRIES[0].currency).toBe("AED");
    expect(GCC_COUNTRIES[1].currency).toBe("SAR");
    expect(GCC_COUNTRY_LABELS.AE).toBe("UAE");
  });

  it("validates codes and falls back to the UAE", () => {
    expect(isGccCountryCode("sa")).toBe(true);
    expect(isGccCountryCode("US")).toBe(false);
    expect(isGccCountryCode(null)).toBe(false);
    expect(countryFromCode("KW").name).toBe("Kuwait");
    expect(countryFromCode("XX").code).toBe("AE");
    expect(countryFromCode(null).code).toBe("AE");
    expect(currencyForCountry("BH")).toBe("BHD");
    expect(currencyForCountry(null)).toBe("AED");
  });
});

describe("country resolution", () => {
  it("prefers the collection's country_code column", () => {
    expect(countryForCollection(collection({ country_code: "SA" }))).toBe("SA");
    expect(countryForCollection(collection({ country_code: "om" }))).toBe("OM");
    expect(countryForCollection(collection())).toBe("AE"); // DB default
    expect(countryForCollection(null)).toBe("AE");
  });

  it("falls back to location heuristics when country_code is missing", () => {
    expect(countryFromLocation("Dubai Municipality (Dubai)")).toBe("AE");
    expect(countryFromLocation("Riyadh, KSA")).toBe("SA");
    expect(countryFromLocation("Doha Municipality")).toBe("QA");
    expect(countryFromLocation("Kuwait City")).toBe("KW");
    expect(countryFromLocation("Manama")).toBeNull();
    expect(countryFromLocation("Muscat, Oman")).toBe("OM");
    expect(countryFromLocation(null)).toBeNull();
  });

  it("resolves a document's country from its collection first", () => {
    const collections = [collection({ id: "c1", country_code: "QA" })];
    expect(countryForDocument(doc({ collection_id: "c1" }), collections)).toBe("QA");
    // No collection → location heuristic → UAE default.
    expect(countryForDocument(doc({ location: "Jeddah" }), collections)).toBe("SA");
    expect(countryForDocument(doc(), collections)).toBe("AE");
    // Unknown collection id → location heuristic still applies.
    expect(countryForDocument(doc({ collection_id: "missing", location: "Bahrain" }), collections)).toBe("BH");
  });

  it("maps collections to currencies for rows without a currency column", () => {
    const resolver = collectionCurrencyResolver([
      collection({ id: "c1", country_code: "KW" }),
      collection({ id: "c2", country_code: "SA" }),
    ]);
    expect(resolver("c1")).toBe("KWD");
    expect(resolver("c2")).toBe("SAR");
    expect(resolver("unknown")).toBe("AED");
    expect(resolver(null)).toBe("AED");
  });
});

describe("computeGccStats", () => {
  const data = {
    collections: [
      collection({ id: "c-ae", owner_id: "u1", country_code: "AE" }),
      collection({ id: "c-sa", owner_id: "u2", country_code: "SA" }),
      collection({ id: "c-qa", owner_id: "u3", country_code: "QA" }),
    ],
    documents: [
      doc({ id: "d1", owner_id: "u1", collection_id: "c-ae" }),
      doc({ id: "d2", owner_id: "u1", collection_id: "c-ae", expires_at: "2026-10-20", status: "active" }),
      doc({ id: "d3", owner_id: "u2", collection_id: "c-sa", expires_at: "2026-10-01", status: "active" }),
      doc({ id: "d4", owner_id: "u3", collection_id: "c-qa" }),
    ],
    transactions: [
      tx({ id: "t1", owner_id: "u1", collection_id: "c-ae", currency: "AED", amount: 1000, kind: "income", occurred_at: "2026-09-01" }),
      tx({ id: "t2", owner_id: "u1", collection_id: "c-ae", currency: "AED", amount: 400, kind: "expense", occurred_at: "2026-09-02" }),
      tx({ id: "t3", owner_id: "u2", collection_id: "c-sa", currency: "SAR", amount: 375, kind: "expense", occurred_at: "2026-09-03" }),
      tx({ id: "t4", owner_id: "u3", collection_id: "c-qa", currency: "QAR", amount: 364, kind: "income", occurred_at: "2026-09-04" }),
    ],
  };

  it("splits collections, documents and transactions per country", () => {
    const stats = computeGccStats(data);
    const byCode = Object.fromEntries(stats.countries.map((c) => [c.code, c]));

    expect(byCode.AE.collections).toBe(1);
    expect(byCode.AE.documents).toBe(2);
    expect(byCode.AE.transactions).toBe(2);
    expect(byCode.AE.users).toBe(1);

    expect(byCode.SA.documents).toBe(1);
    expect(byCode.SA.transactions).toBe(1);
    expect(byCode.QA.transactions).toBe(1);

    // No data for the other three states.
    expect(byCode.KW.collections).toBe(0);
    expect(byCode.BH.documents).toBe(0);
    expect(byCode.OM.transactions).toBe(0);
  });

  it("converts every transaction into AED before totalling", () => {
    const stats = computeGccStats(data);
    const byCode = Object.fromEntries(stats.countries.map((c) => [c.code, c]));

    // AE: 1000 AED income, 400 AED expense.
    expect(byCode.AE.income).toBe(1000);
    expect(byCode.AE.expenses).toBe(400);

    // SA: 375 SAR → 375 × 0.979333 = 367.25 AED.
    expect(byCode.SA.expenses).toBeCloseTo(367.25, 2);

    // QA: 364 QAR → 364 × 1.008929 = 367.25 AED.
    expect(byCode.QA.income).toBeCloseTo(367.25, 2);

    expect(stats.totals.income).toBeCloseTo(1367.25, 1);
    expect(stats.totals.expenses).toBeCloseTo(767.25, 1);
    expect(stats.totals.net).toBeCloseTo(600, 1);
    expect(stats.totals.documents).toBe(4);
    expect(stats.totals.transactions).toBe(4);
    expect(stats.displayCurrency).toBe("AED");
  });

  it("re-totals into any display currency the admin picks", () => {
    const aed = computeGccStats(data, { displayCurrency: "AED" });
    const sar = computeGccStats(data, { displayCurrency: "SAR" });

    expect(sar.displayCurrency).toBe("SAR");
    // Same underlying activity, just rescaled by the AED→SAR rate.
    expect(sar.totals.expenses).toBeCloseTo(aed.totals.expenses / (3.6725 / 3.75), 1);
    expect(sar.totals.transactions).toBe(aed.totals.transactions);
    expect(sar.totals.documents).toBe(aed.totals.documents);
  });

  it("keeps a native-currency column for each country", () => {
    const stats = computeGccStats(data, { displayCurrency: "AED" });
    const sa = stats.countries.find((c) => c.code === "SA")!;
    // SA native expenses rendered in SAR: 367.25 AED → 375 SAR (the round
    // trip is exact; the tiny float drift shows as 374.99…).
    expect(sa.nativeExpenses).toBeCloseTo(375, 1);
    expect(sa.currency).toBe("SAR");
  });

  it("flags documents expiring within the next 30 days only", () => {
    const reference = new Date("2026-09-15T12:00:00Z");
    const stats = computeGccStats(data, { reference });
    const byCode = Object.fromEntries(stats.countries.map((c) => [c.code, c]));
    // d2 expires 2026-10-20 → 35 days out → not flagged.
    expect(byCode.AE.expiringSoon).toBe(0);
    // d3 expires 2026-10-01 → 16 days out → flagged.
    expect(byCode.SA.expiringSoon).toBe(1);
    // Already-expired documents are not "expiring soon".
    const withExpired = computeGccStats(
      { ...data, documents: [...data.documents, doc({ id: "d5", collection_id: "c-ae", expires_at: "2026-09-01" })] },
      { reference },
    );
    expect(withExpired.countries.find((c) => c.code === "AE")!.expiringSoon).toBe(0);
  });

  it("returns an all-zero rollup for an empty bundle", () => {
    const stats = computeGccStats({ collections: [], documents: [], transactions: [] });
    expect(stats.totals).toEqual({
      collections: 0,
      documents: 0,
      transactions: 0,
      users: 0,
      income: 0,
      expenses: 0,
      net: 0,
    });
    expect(stats.countries).toHaveLength(6);
  });
});

describe("legacy 'AED' stamp on non-AE collections (mobile-app bug)", () => {
  // Older mobile-app builds constructed transactions without passing a
  // currency, so the model/DB default 'AED' was stamped even in Kuwaiti,
  // Saudi … workspaces. The console must treat those rows as recorded in
  // their collection's currency — never AED.
  const kwCollections = [collection({ id: "c-kw", country_code: "KW" })];

  it("resolveRowCurrency lets the collection win over a bare AED stamp", () => {
    const forCollection = collectionCurrencyResolver(kwCollections);
    // Legacy stamp / no stamp → collection currency (KWD).
    expect(resolveRowCurrency("AED", "c-kw", forCollection)).toBe("KWD");
    expect(resolveRowCurrency(null, "c-kw", forCollection)).toBe("KWD");
    expect(resolveRowCurrency("", "c-kw", forCollection)).toBe("KWD");
    // An explicit non-AED stamp is honoured (a real SAR payment).
    expect(resolveRowCurrency("sar", "c-kw", forCollection)).toBe("SAR");
    // AE collections keep AED.
    expect(resolveRowCurrency("AED", "c-ae", collectionCurrencyResolver([collection({ id: "c-ae", country_code: "AE" })]))).toBe("AED");
    // Unknown collection with no stamp still falls back to AED.
    expect(resolveRowCurrency("", "missing", forCollection)).toBe("AED");
  });

  it("transactionCurrencyResolver applies the same rule", () => {
    const resolve = transactionCurrencyResolver(kwCollections);
    expect(resolve({ currency: "AED", collection_id: "c-kw" })).toBe("KWD");
    expect(resolve({ currency: "KWD", collection_id: "c-kw" })).toBe("KWD");
    expect(resolve({ currency: "EUR", collection_id: "c-kw" })).toBe("EUR");
  });

  it("aggregates a Kuwait collection's AED-stamped rows as KWD", () => {
    const data = {
      collections: kwCollections,
      documents: [],
      transactions: [
        // Exactly what the bug produced: KW rows stamped with the AED default.
        tx({ id: "t1", collection_id: "c-kw", currency: "AED", amount: 2000, kind: "income" }),
        tx({ id: "t2", collection_id: "c-kw", currency: "AED", amount: 800, kind: "expense" }),
      ],
    };

    // Native (default) view — amounts stay whole, in KWD.
    const native = computeGccCurrencyStats(data);
    const kwd = native.currencies.find((c) => c.currency === "KWD")!;
    expect(kwd.income).toBe(2000);
    expect(kwd.expenses).toBe(800);
    expect(kwd.transactions).toBe(2);
    // Nothing is misfiled under AED.
    expect(native.currencies.find((c) => c.currency === "AED")!.transactions).toBe(0);

    // Converted view — 2000 KWD in AED, not 2000 AED re-labelled as KWD.
    const asAed = computeGccCurrencyStats(data, { displayCurrency: "AED" });
    const kwdAed = asAed.currencies.find((c) => c.currency === "KWD")!;
    expect(kwdAed.income).toBe(2000); // own-currency figures never convert
    expect(kwdAed.displayExpenses).toBeCloseTo(800 * 11.95, 0); // 800 KWD → AED

    // Per-country rollup files the same rows under Kuwait.
    const byCountry = computeGccStats(data, { displayCurrency: "AED" });
    const kw = byCountry.countries.find((c) => c.code === "KW")!;
    expect(kw.transactions).toBe(2);
    expect(kw.income).toBeCloseTo(2000 * 11.95, 0);
    expect(kw.nativeExpenses).toBeCloseTo(800, 1); // native column = KWD, exact
  });
});
