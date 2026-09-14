import React from "react";
import { renderToString } from "react-dom/server";
import LandingPage from "./LandingPage";

// The same public component ships to crawlers and people, before JavaScript.
// The client app replaces this markup and restores its normal stored-state flow.
export function renderLanding() {
  return renderToString(<LandingPage onEnter={() => {}} onFeedback={() => {}} />);
}
