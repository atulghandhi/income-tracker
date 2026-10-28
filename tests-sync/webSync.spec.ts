import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// Two browser windows signed in to the same account, against a fake Supabase that
// implements the Sync v2 contract (compare-and-swap RPC + row select) in this process.

const SUPABASE = "http://127.0.0.1:5999";
const USER_ID = "11111111-1111-1111-1111-111111111111";

type Row = { state: Record<string, any>; revision: number; updated_by: string | null };

class FakeSupabase {
  row: Row | null = null;
  pushes = 0;
  conflicts = 0;

  async attach(context: BrowserContext) {
    await context.route(`${SUPABASE}/**`, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const json = (body: unknown, status = 200) =>
        route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

      if (url.pathname === "/rest/v1/rpc/ledgerlite_push_state") {
        const { p_state, p_base_revision, p_device_id } = request.postDataJSON();
        this.pushes += 1;
        const current = this.row;
        if (current && current.state.schemaVersion > p_state.schemaVersion) {
          return json([{ status: "schema_too_old", revision: current.revision, state: current.state, updated_by: current.updated_by }]);
        }
        if ((current?.revision ?? 0) !== p_base_revision) {
          this.conflicts += 1;
          if (!current) return json([{ status: "missing", revision: 0, state: null, updated_by: null }]);
          return json([{ status: "conflict", revision: current.revision, state: current.state, updated_by: current.updated_by }]);
        }
        this.row = { state: p_state, revision: p_base_revision + 1, updated_by: p_device_id };
        return json([{ status: "ok", revision: this.row.revision, state: null, updated_by: p_device_id }]);
      }
      if (url.pathname === "/rest/v1/ledgerlite_states" && request.method() === "GET") {
        if (!this.row) return json([]);
        const select = url.searchParams.get("select") ?? "";
        return json([select.includes("state") ? this.row : { revision: this.row.revision }]);
      }
      if (url.pathname === "/rest/v1/ledgerlite_profiles") return route.fulfill({ status: 201, body: "" });
      if (url.pathname === "/auth/v1/user") return json(user());
      return json({ message: `unmocked ${request.method()} ${url.pathname}` }, 404);
    });
  }

  names(): string[] {
    if (!this.row) return [];
    return Object.values(this.row.state.months as Record<string, { expenses: Array<{ name: string }> }>)
      .flatMap((month) => month.expenses.map((expense) => expense.name))
      .sort();
  }
}

function base64url(value: object) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function user() {
  return { id: USER_ID, aud: "authenticated", role: "authenticated", email: "test@example.com", app_metadata: { provider: "email" }, user_metadata: {} };
}

function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 24;
  const accessToken = `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url({ sub: USER_ID, exp, role: "authenticated", aud: "authenticated" })}.signature`;
  return { access_token: accessToken, token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "refresh", user: user() };
}

async function openDevice(context: BrowserContext, { signedIn = true } = {}): Promise<Page> {
  await context.addInitScript(
    ({ value, signedIn }) => {
      localStorage.setItem("hasSeenLanding", "1");
      localStorage.setItem("onboardingComplete", "1");
      localStorage.setItem("gettingStartedDismissed", "1");
      if (signedIn && !localStorage.getItem("sb-127-auth-token")) localStorage.setItem("sb-127-auth-token", value);
    },
    { value: JSON.stringify(session()), signedIn },
  );
  const page = await context.newPage();
  await page.goto("/");
  return page;
}

const EXPENSE_NAME = ".panel.expense .addRow input[placeholder='What did you spend on?']";
const EXPENSE_AMOUNT = ".panel.expense .addRow .moneyInput input";

async function openLedger(page: Page) {
  await page.locator(".sideNav").getByRole("button", { name: "Ledger", exact: true }).click();
  await expect(page.locator(EXPENSE_NAME)).toBeVisible();
}

async function addExpense(page: Page, name: string, amount: number) {
  await page.locator(EXPENSE_NAME).fill(name);
  await page.locator(EXPENSE_AMOUNT).fill(String(amount));
  await page.locator(EXPENSE_AMOUNT).press("Enter");
}

async function expenseNames(page: Page) {
  const names = await page
    .locator("input[aria-label='Expense name']")
    .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
  return names.filter(Boolean).sort();
}

// Realtime has no server here, so nudge the "tab came back" path instead.
async function refocus(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test("a transaction added in one window shows up in the other, and concurrent adds both survive", async ({ browser }) => {
  const server = new FakeSupabase();
  const windowA = await browser.newContext();
  const windowB = await browser.newContext();
  await server.attach(windowA);
  await server.attach(windowB);

  const a = await openDevice(windowA);
  await expect.poll(() => server.row?.revision ?? 0).toBe(1);
  const b = await openDevice(windowB);
  await openLedger(a);
  await openLedger(b);

  await addExpense(a, "Coffee from A", 3.5);
  await expect.poll(() => server.names()).toEqual(["Coffee from A"]);

  await refocus(b);
  await expect.poll(() => expenseNames(b)).toEqual(["Coffee from A"]);

  // Both windows add before hearing from each other.
  await addExpense(b, "Lunch from B", 8);
  await addExpense(a, "Taxi from A", 12);

  await expect.poll(() => server.names()).toEqual(["Coffee from A", "Lunch from B", "Taxi from A"]);
  // The second writer lost the compare-and-swap and merged rather than overwrote.
  expect(server.conflicts).toBeGreaterThan(0);
  await refocus(a);
  await refocus(b);
  await expect.poll(() => expenseNames(a)).toEqual(["Coffee from A", "Lunch from B", "Taxi from A"]);
  await expect.poll(() => expenseNames(b)).toEqual(["Coffee from A", "Lunch from B", "Taxi from A"]);
  await expect(a.locator(".saveStatusChip")).toHaveText(/Synced to cloud/);
});

test("signing in with separate data offers to combine, and combining keeps both", async ({ browser }) => {
  const server = new FakeSupabase();
  const existing = await browser.newContext();
  await server.attach(existing);
  const first = await openDevice(existing);
  await openLedger(first);
  await addExpense(first, "Rent from account", 900);
  await expect.poll(() => server.names()).toEqual(["Rent from account"]);

  // A second browser used signed out, then signs in.
  const fresh = await browser.newContext();
  await server.attach(fresh);
  const page = await openDevice(fresh, { signedIn: false });
  await openLedger(page);
  await addExpense(page, "Groceries offline", 40);
  await expect.poll(() => expenseNames(page)).toEqual(["Groceries offline"]);
  await page.waitForTimeout(500);
  await page.evaluate((value) => localStorage.setItem("sb-127-auth-token", value), JSON.stringify(session()));
  await page.reload();

  await expect(page.getByRole("dialog", { name: "Your account already has data" })).toBeVisible();
  await page.getByRole("button", { name: /Combine both/ }).click();

  await expect.poll(() => server.names()).toEqual(["Groceries offline", "Rent from account"]);
  await openLedger(page);
  await expect.poll(() => expenseNames(page)).toEqual(["Groceries offline", "Rent from account"]);
});

test("a cloud saved by a newer app version is never overwritten", async ({ browser }) => {
  const server = new FakeSupabase();
  server.row = {
    state: { schemaVersion: 99, currency: "GBP", months: {}, goals: [], accounts: [], categoryRules: [], nameRules: [], importBatches: [] },
    revision: 7,
    updated_by: "future-app",
  };
  const context = await browser.newContext();
  await server.attach(context);
  const page = await openDevice(context);
  await expect(page.locator(".saveStatusChip")).toHaveText(/Reload to keep syncing/);
  await openLedger(page);
  await addExpense(page, "Should stay local", 5);
  await page.waitForTimeout(1500);
  expect(server.pushes).toBe(0);
  expect(server.row.revision).toBe(7);
});
