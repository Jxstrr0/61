// Draws the host: the sun character from assets/host/sun.svg plus a speech
// balloon. The SVG file is fetched once and inlined so the stylesheet can
// move its parts (rays, lids, brows, mouths). What the host says and which
// face to pull comes from src/host.js; this module never decides that.
//
// Markup produced inside the element you pass to mountHost():
//   <div class="sun-wrap host--<mood>"> …inlined svg… </div>
//   <p class="host__say" role="status">line</p>

let svgText = null; // the file, once loaded (shared by every host on the page)
let instances = 0;  // each inlined copy gets its own ids (see uniqueIds)

/**
 * Two copies of the SVG on one page would share ids (the gradients, the ray
 * shape), and a reference to an id inside a hidden screen does not render.
 * So every copy gets its ids suffixed: sun-skin -> sun-skin-2, and so on.
 */
function uniqueIds(text, n) {
  return text
    .replace(/id="(sun-[a-z-]+)"/g, `id="$1-${n}"`)
    .replace(/href="#(sun-[a-z-]+)"/g, `href="#$1-${n}"`)
    .replace(/url\(#(sun-[a-z-]+)\)/g, `url(#$1-${n})`);
}

async function loadSvg() {
  if (svgText) return svgText;
  try {
    const url = new URL("../../assets/host/sun.svg", import.meta.url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`host svg ${res.status}`);
    svgText = await res.text();
  } catch (error) {
    console.warn("Host art did not load; playing without the host.", error);
    svgText = "";
  }
  return svgText;
}

/**
 * Builds the host inside `el` and returns a small controller.
 * @param {HTMLElement} el
 * @param {object} options { size: "small"|"large" }
 */
export function mountHost(el, options = {}) {
  el.classList.add("host", `host--${options.size ?? "small"}`);
  el.innerHTML = `<div class="sun-wrap host-mood--idle" aria-hidden="true"></div><p class="host__say" role="status" aria-live="polite" hidden></p>`;
  const wrap = el.querySelector(".sun-wrap");
  const say = el.querySelector(".host__say");
  const n = ++instances;
  loadSvg().then((text) => { if (text && !wrap.firstChild) wrap.innerHTML = uniqueIds(text, n); });

  let holdTimer = null;
  let mood = "idle";

  const api = {
    /** Pull a face. Moods are listed in src/host.js (HOST_MOODS). */
    setMood(next) {
      if (!next || next === mood) return;
      wrap.classList.remove(`host-mood--${mood}`);
      mood = next;
      wrap.classList.add(`host-mood--${mood}`);
      // Restart the one-shot reactions (a nod, a wince) even if repeated.
      wrap.classList.remove("host--react");
      void wrap.offsetWidth; // reflow so the animation plays again
      wrap.classList.add("host--react");
    },
    /** Show a line. holdMs > 0 clears it after that long. */
    say(text, holdMs = 0) {
      clearTimeout(holdTimer);
      if (!text) { say.hidden = true; say.textContent = ""; return; }
      say.hidden = false;
      say.textContent = text;
      say.classList.remove("host__say--in");
      void say.offsetWidth;
      say.classList.add("host__say--in");
      if (holdMs > 0) holdTimer = setTimeout(() => { if (say.textContent === text) { say.hidden = true; } }, holdMs);
    },
    /** Mouth moves while true (the clue is being "read"). */
    setTalking(on) {
      wrap.classList.toggle("host--talking", Boolean(on));
    },
    /** Apply a reaction from hostReact(): mood plus line. */
    react(reaction) {
      if (!reaction) return;
      api.setMood(reaction.mood);
      if (reaction.text !== undefined && reaction.text !== "") api.say(reaction.text, reaction.holdMs);
    },
    get mood() { return mood; },
  };
  return api;
}
