# Homepage redesign plan: from visitor to first import

Written 15 November 2026. Plan only; nothing here is built yet.

## The goal, restated

Monarch, YNAB and Lunch Money measure the homepage by one thing: did the visitor start setting up? For them that means creating an account and connecting a bank. The Income Tracker has no account and no bank connection, so the equivalent moment is **the first statement imported**. That is when someone sees their own money in the app, and it is the step that predicts whether they come back next month. Every change below is judged by whether it gets more visitors to that moment, faster.

Today there is no event for it. Before any redesign ships, add `first_import` (fired once per browser, with the source: csv, ofx, pdf, paste, sample) next to the existing `cta_click` and `landing_ref`, so the before and after can be compared. Note that Vercel's Web Analytics API returned "not found" for this project when queried on 15 November, so confirm in the Vercel dashboard that Web Analytics is enabled and that custom events are actually arriving.

## Why the current page reads as AI-made

Screenshots taken on 15 November at 1366px and 390px wide. The specific tells, roughly in order of how much they cost:

1. **It looks like the default template.** Near-black navy with a neon teal accent, Inter at weight 840, a soft glow behind a fake browser window with macOS traffic-light dots. That combination is what most generated SaaS pages produce, and visitors have learned to read it as "nobody in particular made this".
2. **The product shown is not the product.** The hero is a two-column ledger mock with four rows. The real app has a dashboard of widgets, a cash-flow diagram, a subscription finder that flags price rises, goals, a pay calculator and (for the US) federal, state and FICA take-home pay. The page undersells it with a simplified drawing.
3. **Motion and sound for their own sake.** A chime plays on load, buttons click and whoosh on hover, the hero types itself, and every section fades in on scroll. Sound on load is the one to remove first: it surprises people at work, on trains and in bed, and it is the most "demo" thing on the page.
4. **Template rhythm.** Eyebrow label, heading, paragraph, mock, then the same again mirrored, three times. Then a comparison table against two straw men ("Spreadsheet" and "Bank app") where our column is all ticks.
5. **Copy in staccato triads.** "No open banking. No Plaid. No third-party access to your accounts." The point is good; the cadence is the giveaway.
6. **No people and no evidence.** No name, no face, no reviews, no numbers about usage, no date. Nothing a visitor can check.
7. **Three names for one button.** "Continue to app", "Open the ledger" and "Start the ledger", plus "Already use it? Skip the tour" when there is no tour.
8. **On a phone the action is below the fold.** At 390px the mock comes first and the headline starts around 590px down, so the first screen has no reason to tap anything except the small nav button.

## What the apps that convert actually do

From the live homepages of Monarch, YNAB, Lunch Money and Actual Budget (fetched 15 November 2026) and a product manager's teardown of Monarch's sign-up flow (January 2025):

- **One action, named the same way everywhere, with the worry answered right under it.** YNAB: "Start Your Free Trial", then "It's easy! No credit card required." Lunch Money: "Get Started", then "30-day free trial · No credit card required · Your price, locked in".
- **An outcome in the headline.** YNAB opens with "Do you worry about money?" Monarch with "The modern way to manage money". Neither leads with a mechanism.
- **Real screenshots.** Lunch Money and Actual both show the actual dashboard in the hero, with a dark-mode variant in Actual's case.
- **Proof stacked high.** YNAB shows press logos, an App Store "App of the Day", a Trustpilot score with its review count, and a testimonial with a number in it ("I went from living paycheck to paycheck, to having $42K saved in one year"). Monarch quotes WSJ and Forbes and points to its 50,000-member subreddit. Lunch Money uses awards and a founder note.
- **Doors for specific people.** Monarch has "For Couples" in its nav and compare pages against YNAB, Simplifi and Mint. YNAB's goal cards include "Stop arguing about money with my partner". Lunch Money tags a testimonial "ex-Mint & YNAB".
- **Onboarding asks why before it asks who.** Monarch's first question after email is "What brings you to Monarch?" (all my finances in one place, manage money with a partner, track investments). The teardown author credits asking priorities before the personal-details form with raising commitment. Monarch then shows a timeline of the trial with a reminder date, and celebrates each connected account with an animation.
- **Actual Budget is the cautionary case.** It is the closest product to this one (local-first, private, free) and its homepage has no social proof at all, only features. It relies on developers finding it through GitHub. That works for its audience; it would not work for someone searching "free budget planner UK".

## The redesign

### 1. Put the first import on the homepage

The strongest move available, and one the subscription apps cannot copy: **let people drop a statement straight onto the hero.** A drop zone ("Drop a bank statement here: CSV, OFX, QFX or PDF") parses the file in the browser exactly as the app does, then opens the app with that month already filled in. Underneath it, one sentence of reassurance: "The file is read on your device and never uploaded." Beside it, a quieter second option: "Or try it with example data", which loads the sample ledger the app already has.

This turns the homepage from a description of the setup step into the setup step. Monarch's equivalent screen, "Add account", is the one where its own teardown author dropped off twice before succeeding.

### 2. Rewrite the hero around the outcome

Headline options to test, UK wording shown:

- "See where last month's money went, in two minutes."
- "Your bank statement, sorted into a budget. No sign-up, no bank login."

The no-bank-login point moves to the line under the button, where it answers the worry at the moment of acting. One button label everywhere on the page: "Import a statement" (with "Try with example data" as the only secondary).

On phones, headline and drop zone come first and the screenshot follows.

### 3. Show the real app

Replace the three drawn mocks with screenshots of the real dashboard, the cash-flow diagram and the subscriptions page, taken from the sample data in both UK and US form (pounds and "current account" for one, dollars and "checking" for the other). The `marketing/appstore/screenshots` folder may already have usable material. A short silent loop of a CSV being dropped in and the dashboard filling is worth more than any of the current animations.

### 4. A "what you'll see after one import" section

Three concrete results, each with a screenshot: where the money went by category; every subscription found, with its yearly cost and any price rise flagged; and what was left over, with the savings rate. This is the aha moment described in advance, so the visitor knows what they are about to get.

### 5. Honest proof, built from what exists

There are no press logos or store ratings yet, so do not imitate them. Use what can be checked:

- **The code is public** (`atulghandhi/income-tracker`, MIT). "Open source: read exactly what happens to your file" is stronger privacy proof than any badge, and almost no competitor can say it.
- **A founder note** with a name and a face: who builds it, from where, and why there is no bank login. Lunch Money and YNAB both use one; it is the fastest fix for "nobody made this".
- **Shipping cadence** from the changelog (a line like "updated N times since June", counted from `changelog.mjs`), linked to What's new.
- **Real testimonials**, collected properly: an in-app prompt after someone's third month asks for one sentence and permission to quote it. Until there are five good ones, show none.
- **A Product Hunt launch** gives a dated, linkable badge and a burst of links (see the backlinks section).

### 6. Doors for specific people

Small cards under the hero, each going to a page that already exists or is cheap to make:

- UK: "Moneyhub and Money Dashboard closed: here is a free replacement" (both comparison pages exist), "Budgeting as a couple with separate accounts" (guide exists), "Self-employed: get ready for Self Assessment" (guide exists).
- US: "Coming from Mint?" with a Mint CSV import path (needs checking that Mint's export columns import cleanly), and "No Plaid" as its own card.

### 7. Design language

Move away from the dark neon template toward something that looks made by a person for a money task: a light, warm background with a dark mode that follows the system; one restrained accent; a typeface with more character for headings (for example a humanist or editorial serif) paired with a plain sans for body text; real screenshots in place of chrome mocks. Keep motion to one purposeful moment (the drop-in loop). Remove all sound. Drop the comparison table or replace it with an honest one against named alternatives, the way the compare pages already do ("where they win").

### 8. Onboarding after the click

The current wizard asks people to type their income, outgoings, accounts and goals by hand. Change the order:

1. **Ask why first**, Monarch-style, with four answers: see where my money goes; find subscriptions I can cut; save for something; budget with a partner. Store it; it decides which dashboard widgets appear first.
2. **Import before typing.** If they did not drop a file on the homepage, the first step is "Import last month's statement", with the bank picker that links to the 27 UK export guides (US: the CSV/QFX instructions). Manual entry becomes the fallback rather than the default.
3. **Celebrate the import** with the three numbers from section 4, then offer the monthly reminder that already exists in Settings.
4. **Ask for an account last.** After the first import, offer "Sign in to keep this safe and use it on your phone" as protection for something they now have, never as a gate.

## Order of work

**Week 1, quick wins (all small, all reversible):** remove sounds and scroll reveals; one CTA label with reassurance under it; headline and button first on phones; add the `first_import` event and confirm analytics is collecting; add "Try with example data".

**Weeks 2-3, the core change:** homepage drop zone; real screenshots for UK and US; the "after one import" section; new hero copy. At the traffic of mid-November 2026 (about 40 human visitors a week) a split test would take months to say anything, so ship one version and compare `first_import` per homepage visitor for the four weeks before and after, knowing it is directional.

**Weeks 3-6, proof and doors:** founder note; open-source line; persona cards; onboarding reordered (why, then import, then celebrate, then sign-in offer); testimonial prompt; Product Hunt launch once the new page is live.

## Backlinks (Bing's first recommendation)

Bing's warning about too few links from high-quality domains cannot be fixed in code. Ways to earn them that suit this product, none of which involve buying links:

- **Listings where people look for alternatives:** AlternativeTo (as an alternative to Moneyhub, Money Dashboard, Emma, YNAB and Mint), SaaSHub, and Product Hunt.
- **The open-source angle:** a clear README with a link to the site, a Show HN post focused on the local-first design, and relevant curated "awesome" lists for privacy-respecting software.
- **Closures as news:** Moneyhub's consumer app closed on 31 July 2026. Personal-finance journalists and bloggers who covered it are writing "what to use now" pieces; a short, factual pitch with the free alternative is a natural fit.
- **Linkable resources that already exist:** the 27 bank export guides, the free CSV templates and the student budget template suit university money-advice pages and debt-advice resource lists. Ask them to link the specific page, not the homepage.
- **Communities, carefully:** r/UKPersonalFinance and MoneySavingExpert's forum both restrict self-promotion; read and follow their rules, and only answer questions where the tool genuinely fits.

Measure this in Bing Webmaster Tools under Backlinks, monthly. Expect it to move slowly.
