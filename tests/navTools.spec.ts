import { expect, test } from "@playwright/test";
import { initialPinned, toolSuggestions, unseenSuggestionCount } from "../src/navTools";

test.describe("Sidebar tools", () => {
  test("a fresh start gets the short sidebar; someone with data keeps every tool", () => {
    expect(initialPinned(false)).toEqual([]);
    expect(initialPinned(true)).toEqual(["pay", "allocate", "subscriptions"]);
  });

  test("suggests tools from what is in the ledger", () => {
    expect(toolSuggestions({ hasIncome: false, salaryEntered: false, debtCount: 0, recurringCount: 0 })).toEqual({});
    const suggested = toolSuggestions({ hasIncome: true, salaryEntered: false, debtCount: 2, recurringCount: 1 });
    expect(suggested.pay).toBe("You've added income");
    expect(suggested.allocate).toBe("You have 2 debts");
    expect(suggested.subscriptions).toBe("1 recurring payment found");
    // Pay & tax stops being suggested once a salary is entered there.
    expect(toolSuggestions({ hasIncome: true, salaryEntered: true, debtCount: 0, recurringCount: 0 }).pay).toBeUndefined();
  });

  test("the badge counts only unseen suggestions for tools not yet in the sidebar", () => {
    const suggestions = { allocate: "You have a debt", subscriptions: "3 recurring payments found" };
    expect(unseenSuggestionCount({ pinned: [], seen: [] }, suggestions)).toBe(2);
    expect(unseenSuggestionCount({ pinned: ["allocate"], seen: [] }, suggestions)).toBe(1);
    expect(unseenSuggestionCount({ pinned: [], seen: ["subscriptions"] }, suggestions)).toBe(1);
  });
});
