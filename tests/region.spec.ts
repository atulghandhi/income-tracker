import { expect, test } from "@playwright/test";
import {
  accountClassOptions,
  accountPresets,
  accountTypeOption,
  accountTypeOptions,
  accountTypeOptionsFor,
  allAccountTypesForClass,
  americanize,
  billPresets,
  countryFromCurrency,
  countryOptions,
  dateOrderFor,
  defaultContributionSource,
  defaultTaxTreatment,
  detectCountry,
  isLoanType,
  regionOf,
  supportsPlanDetails,
  textLocalizer,
} from "../src/region";
import { detectDateOrder, parseBankText, parseDateValue } from "../src/importer";
import { createInitialState } from "../src/finance";

test.describe("country list and regions", () => {
  test("the United States leads the list and is the only country with its own experience", () => {
    expect(countryOptions[0].code).toBe("US");
    expect(countryOptions[1].code).toBe("GB");
    expect(regionOf("US")).toBe("US");
    expect(regionOf("GB")).toBe("GB");
    for (const option of countryOptions.filter((item) => item.code !== "US")) expect(option.region).toBe("GB");
    expect(countryOptions.find((item) => item.code === "OTHER")?.currency).toBeNull();
  });

  test("ledgers saved before countries existed map from their currency", () => {
    expect(countryFromCurrency("USD")).toBe("US");
    expect(countryFromCurrency("GBP")).toBe("GB");
    expect(countryFromCurrency("EUR")).toBe("IE");
    expect(countryFromCurrency("CAD")).toBe("CA");
    expect(countryFromCurrency(undefined)).toBe("GB");
  });

  test("a fresh US ledger uses dollars", () => {
    expect(createInitialState("US").currency).toBe("USD");
    expect(createInitialState("US").country).toBe("US");
    expect(createInitialState("CA").currency).toBe("GBP");
  });
});

test.describe("browser detection", () => {
  test("a US time zone means the US, with or without a language tag", () => {
    expect(detectCountry({ languages: ["en-US"], timeZone: "America/New_York" })).toBe("US");
    expect(detectCountry({ languages: ["en"], timeZone: "America/Los_Angeles" })).toBe("US");
    expect(detectCountry({ languages: [], timeZone: "Pacific/Honolulu" })).toBe("US");
  });

  test("en-US alone is not enough: it is the default language of browsers everywhere", () => {
    expect(detectCountry({ languages: ["en-US"], timeZone: "UTC" })).toBe("GB");
    expect(detectCountry({ languages: ["en-US"], timeZone: "Europe/London" })).toBe("GB");
    expect(detectCountry({ languages: ["en-US"], timeZone: "Europe/Berlin" })).toBe("GB");
    expect(detectCountry({ languages: ["en-US"], timeZone: "America/Sao_Paulo" })).toBe("US");
  });

  test("other region tags are taken at face value and the UK is the fallback", () => {
    expect(detectCountry({ languages: ["en-GB"], timeZone: "America/New_York" })).toBe("GB");
    expect(detectCountry({ languages: ["en-AU"], timeZone: "Australia/Sydney" })).toBe("AU");
    expect(detectCountry({ languages: ["fr-CA"], timeZone: "America/Toronto" })).toBe("CA");
    expect(detectCountry({ languages: ["ja"], timeZone: "Asia/Tokyo" })).toBe("JP");
    expect(detectCountry({ languages: ["de-DE"], timeZone: "Europe/Berlin" })).toBe("GB");
    expect(detectCountry({ languages: [], timeZone: "" })).toBe("GB");
  });
});

test.describe("language", () => {
  test("US copy swaps UK spellings and terms, keeping case", () => {
    expect(americanize("Card utilisation over 90%")).toBe("Card utilization over 90%");
    expect(americanize("Uncategorised spend is high")).toBe("Uncategorized spend is high");
    expect(americanize("Organise it")).toBe("Organize it");
    expect(americanize("Savings, current accounts, and investments")).toBe("Savings, checking accounts, and investments");
    expect(americanize("Add your current account")).toBe("Add your checking account");
    expect(americanize("Council tax is due")).toBe("Property tax is due");
    expect(americanize("What do the coloured dots mean?")).toBe("What do the colored dots mean?");
    expect(americanize("AI categorisation")).toBe("AI categorization");
    expect(americanize("Customise")).toBe("Customize");
    expect(americanize("COLOUR")).toBe("COLOR");
  });

  test("the UK localiser leaves text alone and the US one applies the swaps", () => {
    expect(textLocalizer("GB")("Card utilisation")).toBe("Card utilisation");
    expect(textLocalizer("US")("Card utilisation")).toBe("Card utilization");
  });
});

test.describe("account types", () => {
  test("each region offers its own instruments with explanations", () => {
    const usSavings = accountTypeOptions("US", "savings").map((option) => option.value);
    expect(usSavings).toEqual(expect.arrayContaining(["hysa", "cd", "money-market", "hsa", "fsa"]));
    expect(usSavings).not.toContain("isa");
    const gbSavings = accountTypeOptions("GB", "savings").map((option) => option.value);
    expect(gbSavings).toEqual(expect.arrayContaining(["isa", "lisa"]));
    expect(gbSavings).not.toContain("hsa");

    const usInvest = accountTypeOptions("US", "investment").map((option) => option.value);
    expect(usInvest).toEqual(expect.arrayContaining(["401k", "403b", "traditional-ira", "roth-ira", "529"]));
    const gbInvest = accountTypeOptions("GB", "investment").map((option) => option.value);
    expect(gbInvest).toEqual(expect.arrayContaining(["pension", "sipp", "isa"]));

    for (const region of ["US", "GB"] as const) {
      for (const cls of ["cash", "savings", "investment", "debt"] as const) {
        for (const option of accountTypeOptions(region, cls)) expect(option.info.length).toBeGreaterThan(20);
      }
    }
  });

  test("labels follow the country: current vs checking, overdraft vs line of credit", () => {
    expect(accountTypeOption("GB", "cash", "current").label).toBe("Current account");
    expect(accountTypeOption("US", "cash", "current").label).toBe("Checking account");
    expect(accountTypeOption("GB", "debt", "overdraft").label).toBe("Overdraft");
    expect(accountTypeOption("US", "debt", "overdraft").label).toBe("Line of credit");
    expect(accountClassOptions("US").find((option) => option.value === "cash")?.label).toBe("Checking account");
    expect(accountClassOptions("GB").find((option) => option.value === "cash")?.label).toBe("Current account");
  });

  test("an account from the other region keeps a label and stays selectable", () => {
    expect(accountTypeOption("GB", "investment", "401k").label).toBe("401(k)");
    const options = accountTypeOptionsFor("GB", "investment", "401k");
    expect(options[options.length - 1].value).toBe("401k");
    expect(accountTypeOptionsFor("US", "investment", "investment").some((option) => option.value === "isa")).toBe(false);
    expect(allAccountTypesForClass("investment")).toEqual(expect.arrayContaining(["401k", "pension", "isa", "roth-ira"]));
    expect(allAccountTypesForClass("debt")).toEqual(expect.arrayContaining(["mortgage", "student-loan", "auto-loan"]));
  });

  test("defaults: tax treatment, contribution source, plan details and loan shapes", () => {
    expect(defaultTaxTreatment("US", "investment", "401k")).toBe("pre-tax");
    expect(defaultTaxTreatment("US", "investment", "roth-ira")).toBe("roth");
    expect(defaultTaxTreatment("US", "savings", "hsa")).toBe("triple");
    expect(defaultTaxTreatment("GB", "savings", "isa")).toBe("tax-free");
    expect(defaultTaxTreatment("GB", "investment", "pension")).toBe("pre-tax");
    expect(defaultContributionSource("US", "investment", "401k")).toBe("payroll");
    expect(defaultContributionSource("US", "investment", "roth-ira")).toBe("personal");
    expect(defaultContributionSource("GB", "investment", "pension")).toBe("payroll");
    expect(defaultContributionSource("GB", "savings", "savings")).toBe("personal");
    expect(supportsPlanDetails("investment", "401k")).toBe(true);
    expect(supportsPlanDetails("savings", "savings")).toBe(false);
    expect(supportsPlanDetails("debt", "student-loan")).toBe(false);
    expect(isLoanType("mortgage")).toBe(true);
    expect(isLoanType("credit-card")).toBe(false);
  });

  test("onboarding presets speak the local language", () => {
    expect(billPresets("US").map((preset) => preset.name)).toEqual(expect.arrayContaining(["Property tax", "HOA dues", "Health insurance"]));
    expect(billPresets("GB").map((preset) => preset.name)).toContain("Council tax");
    expect(accountPresets("US").map((preset) => preset.type)).toEqual(expect.arrayContaining(["401k", "roth-ira", "hsa"]));
    expect(accountPresets("GB").map((preset) => preset.type)).toContain("pension");
  });
});

test.describe("statement dates", () => {
  test("the region decides ambiguous dates, unambiguous ones decide themselves", () => {
    expect(dateOrderFor("US")).toBe("mdy");
    expect(dateOrderFor("GB")).toBe("dmy");
    expect(parseDateValue("03/04/2026", undefined, "dmy")).toBe("2026-04-03");
    expect(parseDateValue("03/04/2026", undefined, "mdy")).toBe("2026-03-04");
    expect(parseDateValue("13/04/2026", undefined, "mdy")).toBe("2026-04-13");
    expect(parseDateValue("04/13/2026", undefined, "dmy")).toBe("2026-04-13");
    expect(detectDateOrder(["03/04/2026", "13/04/2026"], "mdy")).toBe("dmy");
    expect(detectDateOrder(["03/04/2026", "04/13/2026"], "dmy")).toBe("mdy");
    expect(detectDateOrder(["03/04/2026"], "mdy")).toBe("mdy");
  });

  test("a US ledger reads a month-first CSV, a UK ledger reads the same file day-first", () => {
    const csv = ["Date,Description,Amount", "03/04/2026,Trader Joe's,-42.10"].join("\n");
    const us = parseBankText({ text: csv, fileName: "chase.csv", state: createInitialState("US"), fallbackMonthKey: "2026-03" });
    expect(us.rows[0].date).toBe("2026-03-04");
    const gb = parseBankText({ text: csv, fileName: "chase.csv", state: createInitialState("GB"), fallbackMonthKey: "2026-03" });
    expect(gb.rows[0].date).toBe("2026-04-03");
    // A file that can only be month-first overrides the UK default.
    const unambiguous = ["Date,Description,Amount", "04/13/2026,Trader Joe's,-42.10", "04/02/2026,Target,-10.00"].join("\n");
    const rows = parseBankText({ text: unambiguous, fileName: "chase.csv", state: createInitialState("GB"), fallbackMonthKey: "2026-04" }).rows;
    expect(rows.map((row) => row.date).sort()).toEqual(["2026-04-02", "2026-04-13"]);
  });
});
