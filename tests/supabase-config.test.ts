import { describe, expect, it } from "vitest";
import { supabaseProjectRef } from "@/lib/supabase";

describe("supabaseProjectRef", () => {
  it("extracts the ref from standard supabase.co URLs", () => {
    expect(supabaseProjectRef("https://jxyzmnaqukxvrcwolkil.supabase.co")).toBe("jxyzmnaqukxvrcwolkil");
  });

  it("extracts the ref from regional TLDs", () => {
    expect(supabaseProjectRef("https://abcdefghijklmnopqrst.supabase.in")).toBe("abcdefghijklmnopqrst");
    expect(supabaseProjectRef("https://abcdefghijklmnopqrst.supabase.red")).toBe("abcdefghijklmnopqrst");
  });

  it("lowercases mixed-case hosts", () => {
    expect(supabaseProjectRef("https://JXYZMNAQUKXVRCWOLKIL.supabase.co")).toBe("jxyzmnaqukxvrcwolkil");
  });

  it("returns null for non-Supabase hosts, invalid URLs and empty input", () => {
    expect(supabaseProjectRef("https://example.com")).toBeNull();
    expect(supabaseProjectRef("not a url")).toBeNull();
    expect(supabaseProjectRef("")).toBeNull();
    expect(supabaseProjectRef(null)).toBeNull();
    expect(supabaseProjectRef(undefined)).toBeNull();
  });
});
