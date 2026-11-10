// Draws an agent as stacked layers: body, shirt, head, hat.
//
// Every sprite is stretched over the same square canvas, so all PNGs must be the same square
// size (for example 256x256, transparent background) with each part already painted where it
// belongs on the agent. A layer without a PNG is drawn as a simple placeholder shape.

import { svg } from "./ui.js";

const SKIN = "#e2bc9a";
const LINE = "#261e1a";
const STROKE = { stroke: LINE, "stroke-width": 1.1 };

/** look = { head, body, shirt, hat } (item rows, any may be missing). */
export function avatar(look, spriteUrl) {
  const root = svg("svg", { viewBox: "0 0 100 100", class: "avatar", role: "img", "aria-label": "Agent picture" });

  // Returns true when the layer was drawn from its PNG.
  const sprite = (item) => {
    if (!item || !item.sprite_path) return false;
    root.append(svg("image", { href: spriteUrl(item.sprite_path), x: 0, y: 0, width: 100, height: 100 }));
    return true;
  };

  const bodyWidth = Number((look.body && look.body.placeholder_width) || 0.4) * 100;
  const bodyX = (100 - bodyWidth) / 2;

  if (!sprite(look.body)) {
    root.append(svg("rect", { x: bodyX, y: 45, width: bodyWidth, height: 50, rx: 8, fill: SKIN, ...STROKE }));
  }

  if (look.shirt && !sprite(look.shirt)) {
    root.append(svg("rect", { x: bodyX - 1.2, y: 45, width: bodyWidth + 2.4, height: 36, rx: 7, fill: look.shirt.placeholder_color, ...STROKE }));
  }

  if (!sprite(look.head)) {
    root.append(
      svg("circle", { cx: 50, cy: 30, r: 17, fill: SKIN, ...STROKE }),
      svg("circle", { cx: 44, cy: 32.7, r: 1.7, fill: LINE }),
      svg("circle", { cx: 56, cy: 32.7, r: 1.7, fill: LINE }));
  }

  if (look.hat && !sprite(look.hat)) {
    root.append(
      svg("path", { d: "M31.5 25.5 A18.5 16 0 0 1 68.5 25.5 Z", fill: look.hat.placeholder_color, ...STROKE }),
      svg("rect", { x: 26, y: 24, width: 48, height: 4, rx: 2, fill: look.hat.placeholder_color, ...STROKE }));
  }

  return root;
}

/** One flame (minor) or two flames (major); nothing for "none". */
export function flames(passion) {
  const root = svg("svg", { viewBox: "0 0 26 20", class: "flames passion-" + passion, "aria-hidden": "true" });
  const flame = (dx) => svg("g", { transform: `translate(${dx} 0)` },
    svg("path", { class: "flame-outer", d: "M7.7 0.5 C10 7 15.5 13 7 19.5 C-1.5 13 5.5 9.5 7.7 0.5 Z" }),
    svg("path", { class: "flame-inner", d: "M7 9.5 C8.5 13 10 15.5 7 19 C4 15.5 6 13 7 9.5 Z" }));
  if (passion === "major") root.append(flame(0), flame(9));
  else root.append(flame(0)); // "none" draws a faint outline (styled in CSS) when it is clickable
  return root;
}
