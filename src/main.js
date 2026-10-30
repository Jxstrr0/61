// 61 - A Trivia Game: boot and hash router.
//
// Phase 1: this file only switches between the <section data-screen="…">
// blocks in index.html based on the URL hash (#home, #about, …). Later
// phases import the rules engine (game.js) and the UI modules under ui/
// and wire them up here. The engine never touches the DOM; this file and
// the ui/ modules are the only places that do.

const SCREENS = ["home", "library", "game", "practice", "stats", "results", "about"];
const DEFAULT_SCREEN = "home";

/** Reads the screen name out of the hash, falling back to Home. */
export function screenFromHash(hash) {
  const name = String(hash || "").replace(/^#/, "").split("?")[0];
  return SCREENS.includes(name) ? name : DEFAULT_SCREEN;
}

/** Shows one screen and hides the rest. */
function showScreen(name) {
  const sections = document.querySelectorAll("[data-screen]");
  let found = false;
  for (const section of sections) {
    const match = section.dataset.screen === name;
    section.hidden = !match;
    if (match) found = true;
  }
  if (!found) {
    // A screen the HTML does not have yet (built in a later phase): go Home.
    for (const section of sections) section.hidden = section.dataset.screen !== DEFAULT_SCREEN;
  }
  window.scrollTo(0, 0);
}

function route() {
  showScreen(screenFromHash(location.hash));
}

// Only run the router in a browser; tests import screenFromHash from Node.
if (typeof window !== "undefined" && typeof document !== "undefined") {
  window.addEventListener("hashchange", route);
  route();
}
