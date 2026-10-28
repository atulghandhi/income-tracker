import { expect, test } from "@playwright/test";
import { initialPinned, toolSuggestions, unseenSuggestionCount } from "../src/navTools";

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
});
