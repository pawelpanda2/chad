/**
 * Links V2 GUI — column-resize drag logic for the 3-mode tri/dual-panel
 * layout (Leads/Google: left | center | right, Conv: left | right). Mutates
 * `container.style.gridTemplateColumns` directly during drag (no React
 * re-render per pixel) so the resize stays smooth, matching the accepted
 * `examples/CHAD_links_v2_redesign_mockup_v10.html` behavior.
 */

export type ResizeSide = "left" | "right" | "single";

export interface ResizeOptions {
  /** Minimum width (px) for the panel being resized (and, for "left"/"right", the fixed opposite side panel). */
  min: number;
  /** Minimum width (px) for the flexible center panel ("left"/"right" only). */
  centerMin: number;
}

const RESIZER_PX = 14;
/** Slack for the two resizer tracks + a little breathing room, matching the mockup's own constant. */
const GAP_SLACK = 28;
const SINGLE_SLACK = 12;

/** Binds a mousedown handler that drags one resizer of a CSS-grid panel layout. Returns a cleanup-free handler — call it directly from onMouseDown. */
export function startColumnResize(
  container: HTMLDivElement,
  side: ResizeSide,
  startClientX: number,
  opts: ResizeOptions
): void {
  document.body.classList.add("select-none");
  document.body.style.cursor = "col-resize";
  const cols = getComputedStyle(container)
    .gridTemplateColumns.split(" ")
    .map((v) => parseFloat(v));

  function onMove(ev: MouseEvent) {
    const dx = ev.clientX - startClientX;
    const w = container.getBoundingClientRect().width;
    if (side === "left") {
      const left = Math.max(opts.min, Math.min(cols[0] + dx, w - cols[4] - opts.centerMin - GAP_SLACK));
      container.style.gridTemplateColumns = `${left}px ${RESIZER_PX}px minmax(${opts.centerMin}px,1fr) ${RESIZER_PX}px ${cols[4]}px`;
    } else if (side === "right") {
      const right = Math.max(opts.min, Math.min(cols[4] - dx, w - cols[0] - opts.centerMin - GAP_SLACK));
      container.style.gridTemplateColumns = `${cols[0]}px ${RESIZER_PX}px minmax(${opts.centerMin}px,1fr) ${RESIZER_PX}px ${right}px`;
    } else {
      const left = Math.max(opts.min, Math.min(cols[0] + dx, w - opts.min - SINGLE_SLACK));
      container.style.gridTemplateColumns = `${left}px ${RESIZER_PX}px minmax(${opts.min}px,1fr)`;
    }
  }
  function onUp() {
    document.body.classList.remove("select-none");
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}
