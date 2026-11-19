// Which design a visitor saw. The app (src/analytics.ts) and the static pages
// (scripts/build-content.mjs) both attach it to every analytics event as `ui`, so a
// before/after comparison is one breakdown. Events from before this existed carry none.
// Bump it whenever a redesign ships.
export const UI_VERSION = "2026-11-frame";
