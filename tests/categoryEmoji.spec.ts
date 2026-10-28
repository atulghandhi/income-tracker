import { expect, test } from "@playwright/test";
import { categoryEmoji } from "../src/ledgerGroups";

test.describe("Category emoji", () => {
  test("matches the default categories and common free-text names", () => {
    expect(categoryEmoji("Home")).toBe("🏠");
    expect(categoryEmoji("Food")).toBe("🛒");
    expect(categoryEmoji("Bills")).toBe("💡");
    expect(categoryEmoji("Debt payments")).toBe("💳");
    expect(categoryEmoji("subscriptions")).toBe("📺");
    expect(categoryEmoji("  Travel ")).toBe("🚗");
  });

  test("prefers the more specific word", () => {
    // "Eating out" is food, but it is not groceries.
    expect(categoryEmoji("Eating out")).toBe("🍔");
    expect(categoryEmoji("Phone bill")).toBe("📱");
  });

  test("leaves unknown and empty names without one", () => {
    expect(categoryEmoji("Zorblax")).toBe("");
    expect(categoryEmoji("")).toBe("");
  });
});
