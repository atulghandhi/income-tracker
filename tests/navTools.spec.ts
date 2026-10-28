import { expect, test } from "@playwright/test";
import { canHide, initialPinned, toolSuggestions, unseenSuggestionCount, withSidebarItem } from "../src/navTools";

test.describe("Sidebar tools", () => {
  test("a fresh start gets the short sidebar; someone with data keeps every tool", () => {
    expect(initialPinned(false)).toEqual([]);
    expect(initialPinned(true)).toEqual(["goals", "pay", "allocate"]);
  });

  test("suggests tools from what is in the ledger", () => {
    const none = { hasIncome: false, salaryEntered: false, debtCount: 0, monthlySurplus: 0, hasGoals: false };
    expect(toolSuggestions(none)).toEqual({});
    const suggested = toolSuggestions({ hasIncome: true, salaryEntered: false, debtCount: 2, monthlySurplus: 300, hasGoals: false });
    expect(suggested.pay).toBe("You've added income");
    expect(suggested.allocate).toBe("You have 2 debts");
    expect(suggested.goals).toBe("You have money left over each month");
    // Pay & tax stops being suggested once a salary is entered there, Goals once a goal exists.
    expect(toolSuggestions({ ...none, hasIncome: true, salaryEntered: true }).pay).toBeUndefined();
    expect(toolSuggestions({ ...none, monthlySurplus: 300, hasGoals: true }).goals).toBeUndefined();
  });

  test("the badge counts only unseen suggestions for tools not yet in the sidebar", () => {
    const suggestions = { allocate: "You have a debt", goals: "You have money left over each month" };
    expect(unseenSuggestionCount({ pinned: [], seen: [] }, suggestions)).toBe(2);
    expect(unseenSuggestionCount({ pinned: ["allocate"], seen: [] }, suggestions)).toBe(1);
    expect(unseenSuggestionCount({ pinned: [], seen: ["goals"] }, suggestions)).toBe(1);
  });

  test("everyday pages can be hidden and shown; Dashboard, Ledger and Settings never", () => {
    expect(["dashboard", "ledger", "settings"].map((view) => canHide(view as never))).toEqual([false, false, false]);
    expect(["accounts", "subscriptions", "goals", "pay", "allocate"].map((view) => canHide(view as never))).toEqual([true, true, true, true, true]);
    const start = { pinned: ["goals" as const], hidden: [], seen: [] };
    const hidden = withSidebarItem(withSidebarItem(start, "subscriptions", false), "goals", false);
    expect(hidden.hidden).toEqual(["subscriptions"]);
    expect(hidden.pinned).toEqual([]);
    const shown = withSidebarItem(withSidebarItem(hidden, "subscriptions", true), "goals", true);
    expect(shown.hidden).toEqual([]);
    expect(shown.pinned).toEqual(["goals"]);
    // Nothing happens to a page that can't be hidden.
    expect(withSidebarItem(start, "ledger", false)).toEqual(start);
  });
});
