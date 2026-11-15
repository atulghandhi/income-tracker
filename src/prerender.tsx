import React from "react";
import { renderToString } from "react-dom/server";
import LandingPage from "./LandingPage";
import type { RegionKey } from "./region";

export { LANDING_COPY, LANDING_PATHS, SITE } from "./landingContent";
export { APP_VIEWS, VIEW_META, titleForView } from "./routes";

// The same public component ships to crawlers and people, before JavaScript.
// The client app replaces this markup and restores its normal stored-state flow.
export function renderLanding(region: RegionKey = "GB") {
  return renderToString(<LandingPage region={region} onEnter={() => {}} onFeedback={() => {}} />);
}
