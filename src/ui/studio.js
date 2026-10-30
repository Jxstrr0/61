// The studio set: lighting rig, moving beams and the floor behind the game,
// an audience strip (assets/studio/audience.svg) that bounces on applause,
// and an ON AIR lamp. Everything is CSS-animated; this module only builds
// the markup and flips classes when the game tells it to.

let crowdSvg = null;

async function loadCrowd() {
  if (crowdSvg) return crowdSvg;
  try {
    const res = await fetch(new URL("../../assets/studio/audience.svg", import.meta.url));
    if (!res.ok) throw new Error(`audience svg ${res.status}`);
    crowdSvg = await res.text();
  } catch (error) {
    console.warn("Audience art did not load; the seats stay dark.", error);
    crowdSvg = "";
  }
  return crowdSvg;
}

/** The backdrop layers. `el` is positioned absolute behind the screen's content. */
export function mountStudio(el) {
  el.classList.add("studio");
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `
    <div class="studio__glow"></div>
    <div class="studio__beam studio__beam--l"></div>
    <div class="studio__beam studio__beam--r"></div>
    <div class="studio__truss"><i></i><i></i><i></i><i></i><i></i></div>
    <div class="studio__floor"></div>
    <div class="studio__flash"></div>`;
  return {
    /** A quick white-hot flash (Daily Double, Final reveal). */
    flash() {
      el.classList.remove("studio--flash");
      void el.offsetWidth;
      el.classList.add("studio--flash");
    },
    /** Dim everything but one spot (Final think time). */
    setHush(on) { el.classList.toggle("studio--hush", Boolean(on)); },
  };
}

/** The audience strip. */
export function mountCrowd(el) {
  el.classList.add("crowd");
  el.setAttribute("aria-hidden", "true");
  loadCrowd().then((text) => { if (text) el.innerHTML = text; });
  let timer = null;
  const pulse = (cls, ms) => {
    el.classList.remove("crowd--applause", "crowd--groan");
    void el.offsetWidth;
    el.classList.add(cls);
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove(cls), ms);
  };
  return {
    applause(big = false) { pulse("crowd--applause", big ? 2600 : 1400); },
    groan() { pulse("crowd--groan", 900); },
    setHush(on) { el.classList.toggle("crowd--hush", Boolean(on)); },
  };
}

/** The ON AIR lamp in the top bar: lit while a clue or the Final is live. */
export function setOnAir(el, live) {
  if (!el) return;
  el.classList.toggle("onair--live", Boolean(live));
  el.setAttribute("aria-label", live ? "On air" : "Off air");
}
