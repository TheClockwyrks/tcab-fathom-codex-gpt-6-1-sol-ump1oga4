import type { RenderApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import type { FathomState, Direction } from "./game";
import { BACKGROUND, center, menuItems, menuItemRect, tile } from "./game";
import * as C from "./constants";
export function render(s: DeepReadonly<FathomState>, { ctx: g }: RenderApi) {
  g.imageSmoothingEnabled = false;
  const text = (
    t: string,
    x: number,
    y: number,
    size = 16,
    color = "#83b2bc",
    align: CanvasTextAlign = "left",
  ) => {
    g.font = `${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(t, x, y);
  };
  const line = (
    x: number,
    y: number,
    x2: number,
    y2: number,
    color = "#193039",
  ) => {
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
  };
  const glow = (x: number, y: number, r: number, color: string) => {
    const a = g.createRadialGradient(x, y, 0, x, y, r);
    a.addColorStop(0, color);
    a.addColorStop(1, "transparent");
    g.fillStyle = a;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const sprite = (
    sheet: string,
    i: number,
    x: number,
    y: number,
    size = C.TILE,
  ) => {
    const im = s.art[sheet]?.[i];
    if (im)
      g.drawImage(im as ImageBitmap, x - size / 2, y - size / 2, size, size);
  };
  const facing = (d: Direction) => ({ down: 0, up: 2, left: 4, right: 6 })[d];
  const terrain = () => {
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const v = s.visibility[y][x];
        if (v === "u") {
          const c = center(x, y);
          sprite("trench-walls", 17, c.x, c.y);
          continue;
        }
        const t = tile(s, x, y);
        let frame = 16;
        if (t === "#")
          frame =
            (tile(s, x, y - 1) === "#" ? 1 : 0) +
            (tile(s, x + 1, y) === "#" ? 2 : 0) +
            (tile(s, x, y + 1) === "#" ? 4 : 0) +
            (tile(s, x - 1, y) === "#" ? 8 : 0);
        if (t === "g") frame = 18;
        const c = center(x, y);
        g.globalAlpha = v === "r" ? 0.23 : 1;
        sprite("trench-walls", frame, c.x, c.y);
        if (s.plankton[y][x] === "*") {
          g.fillStyle = "#a2fff0";
          g.shadowColor = "#63ffe4";
          g.shadowBlur = v === "l" ? 8 : 0;
          g.beginPath();
          g.arc(c.x, c.y, C.PLANKTON_DOT / 2, 0, Math.PI * 2);
          g.fill();
          g.shadowBlur = 0;
        }
      }
    g.globalAlpha = 1;
  };
  const mazeScreen = ["countdown", "playing", "paused", "cleared"].includes(
    s.screen,
  );
  g.fillStyle = BACKGROUND;
  g.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  if (mazeScreen) {
    g.save();
    g.beginPath();
    g.arc(s.forager.x, s.forager.y, s.windowRadius, 0, Math.PI * 2);
    g.clip();
    terrain();
    glow(s.forager.x, s.forager.y, s.windowRadius, "#1b8e9325");
    for (const b of [
      ...s.drifters,
      ...s.predators.filter(
        (p) => p.kind === "lanternjaw" && p.state !== "den",
      ),
    ]) {
      glow(b.x, b.y, 19, "#ff6a2b66");
      g.fillStyle = "#ff9c63";
      g.beginPath();
      g.arc(b.x, b.y, 3, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    for (const p of s.predators)
      if (p.flaring) {
        g.save();
        g.beginPath();
        g.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
        g.clip();
        terrain();
        g.restore();
      }
    for (const p of s.pulses) {
      g.fillStyle =
        p.tint === "cyan"
          ? "#65ffe9"
          : p.tint === "violet"
            ? "#a480ff"
            : "#ff9c52";
      g.shadowColor = g.fillStyle;
      g.shadowBlur = 12;
      for (let i = 0; i < p.dist.length; i++) {
        const d = p.dist[i];
        if (d < 0 || Math.abs(d - p.front) > 0.7) continue;
        const c = center(i % C.GRID_COLS, Math.floor(i / C.GRID_COLS));
        g.globalAlpha = Math.max(0, 1 - Math.abs(d - p.front));
        g.fillRect(c.x - 12, c.y - 12, 24, 24);
      }
      g.globalAlpha = 1;
      g.shadowBlur = 0;
    }
    for (const c of s.inkClouds) {
      glow(c.x, c.y, c.radius, "#000008ee");
      g.fillStyle = "#000007bb";
      g.beginPath();
      g.arc(c.x, c.y, c.radius * 0.82, 0, Math.PI * 2);
      g.fill();
    }
    for (const d of s.drifters)
      if (d.lit) sprite("drifter", Math.floor(s.simTime * 8) % 8, d.x, d.y);
    for (const p of s.predators) {
      if (p.lit)
        sprite(
          p.kind,
          p.kind === "lanternjaw" && p.state === "wander"
            ? 8 + (Math.floor(s.simTime * 8) % 8)
            : facing(p.dir) + (Math.floor(s.simTime * 7) % 2),
          p.x,
          p.y,
        );
      if (p.alert) {
        g.strokeStyle = p.kind === "gloamfin" ? "#be96ff" : "#ffb37c";
        g.lineWidth = 2;
        const r = 18 + (1 - p.alertIn / C.ALERT_TIME) * 25;
        g.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          g.moveTo(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
          g.lineTo(p.x + Math.cos(a) * (r + 10), p.y + Math.sin(a) * (r + 10));
        }
        g.stroke();
      }
      if (p.fade > 0)
        sprite(
          "flare-bloom",
          p.fade > 0.15 ? 6 : 7,
          p.x,
          p.y,
          C.FLARE_RADIUS * 2,
        );
      if (p.phase > 0)
        sprite(
          "flare-bloom",
          p.flareCharging
            ? Math.min(2, Math.floor((p.phase / C.FLARE_CHARGE) * 3))
            : 3 +
                Math.min(
                  2,
                  Math.floor(((p.phase - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3),
                ),
          p.x,
          p.y,
          C.FLARE_RADIUS * 2,
        );
    }
    glow(s.forager.x, s.forager.y, 42, "#54ffe64a");
    sprite(
      "glimmerfin",
      facing(s.forager.dir) +
        (s.forager.moving ? Math.floor(s.simTime * 9) % 2 : 0),
      s.forager.x,
      s.forager.y,
    );
    line(64, 73, 1216, 73);
    text(C.DIVE_LABEL, 65, 35, 14, "#63e7d5");
    text(
      "ABYSSAL SURVEY / " + String(s.depth).padStart(2, "0"),
      65,
      58,
      11,
      "#48666e",
    );
    text(String(s.score).padStart(6, "0"), 640, 59, 48, "#dbfff5", "center");
    text("F A T H O M", 1216, 36, 19, "#a3c7c9", "right");
    text(
      s.muted ? "M / SOUND OFF" : "M / SOUND ON",
      1216,
      58,
      11,
      "#48666e",
      "right",
    );
    line(64, 665, 1216, 665);
    text(`DEPTH ${s.depth}`, 65, 702, 17, "#c8e8e7");
    for (let i = 0; i < s.lives; i++)
      sprite("glimmerfin", 0, 220 + i * 30, 694, 24);
    text(`${s.planktonRemaining} MOTES`, 390, 700, 13);
    for (const [i, label, ready, cool, max] of [
      [0, "SPACE / SONAR", s.sonar.ready, s.sonar.cooldown, C.SONAR_COOLDOWN],
      [1, "SHIFT / INK", s.ink.ready, s.ink.cooldown, C.INK_COOLDOWN],
    ] as const) {
      const x = 680 + i * 275;
      text(label, x, 691, 12, ready ? "#a5f7e4" : "#526c74");
      g.fillStyle = "#152b32";
      g.fillRect(x, 701, 190, 3);
      g.fillStyle = ready ? "#63e6cc" : "#346a73";
      g.fillRect(x, 701, 190 * (1 - cool / max), 3);
    }
  }
  if (s.screen === "title" || s.screen === "gameover" || s.screen === "howto") {
    for (let i = 0; i < 100; i++) {
      const x = (i * 157.31) % 1280,
        y = (i * 89.71) % 720;
      g.globalAlpha = 0.1 + 0.1 * Math.sin(i + s.simTime);
      g.fillStyle = "#7ee7d3";
      g.fillRect(x, y, 2, 2);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      g.strokeStyle = `rgba(50,137,146,${0.12 - i * 0.018})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(640, 325, 160 + i * 85, 160 + i * 40, 0, 0, Math.PI * 2);
      g.stroke();
    }
    glow(640, 300, 300, "#087d7828");
    text(
      "—  B A T H Y P E L A G I C   /   0 1  —",
      640,
      115,
      13,
      "#4b9297",
      "center",
    );
    if (s.screen === "title") {
      text(C.TITLE_TEXT, 640, 290, 112, "#c6fff0", "center");
      text(
        C.TAGLINE_TEXT.split("").join(" "),
        640,
        337,
        16,
        "#56c9ba",
        "center",
      );
      sprite("glimmerfin", 6, 640, 375, 32);
      text(
        "A LITTLE LIGHT. A VERY DEEP DARK.",
        640,
        600,
        12,
        "#50757c",
        "center",
      );
      text(
        "ARROWS / WASD   ·   SPACE / SONAR   ·   SHIFT / INK",
        640,
        665,
        12,
        "#55757c",
        "center",
      );
    }
    if (s.screen === "gameover") {
      text("SIGNAL LOST", 640, 270, 64, "#f2bc93", "center");
      text(
        `SCORE ${s.score}    /    DEPTH ${s.depth}`,
        640,
        335,
        21,
        "#b0d9d6",
        "center",
      );
    }
    if (s.screen === "howto") {
      g.fillStyle = "#031018ed";
      g.fillRect(150, 145, 980, 470);
      text("READ THE DARK", 210, 205, 36, "#c5fff0");
      const lines = [
        "ARROWS / WASD  Swim. Release to hold still.",
        "SPACE  Send sonar around corners. SHIFT  Leave ink.",
        "P / ESC  Pause. M  Toggle sound. ENTER  Select.",
        "",
        "Your light reveals rock. Sonar remembers the passages.",
        "Eat plankton: grow brighter, see farther, draw hunters.",
        "",
        "LANTERNJAW hunts light. An amber glow may be a trap.",
        "GLOAMFIN hunts sound. Corners slow its pursuit.",
        "FLAREFISH hunts light and burns the dark with flares.",
      ];
      lines.forEach((t, i) =>
        text(t, 210, 250 + i * 28, 16, i > 6 ? "#c3b5a1" : "#83b7ba"),
      );
      text("ENTER / ESC / TAP TO RETURN", 640, 654, 14, "#6de0c9", "center");
    }
  }
  if (
    s.screen === "paused" ||
    s.screen === "countdown" ||
    s.screen === "cleared"
  ) {
    g.fillStyle = "#02090ebd";
    g.fillRect(350, 215, 580, s.screen === "paused" ? 395 : 240);
    text(
      s.screen === "paused"
        ? "DRIFTING"
        : s.screen === "cleared"
          ? `DEPTH ${s.depth} CLEARED`
          : "DIVE",
      640,
      325,
      s.screen === "cleared" ? 36 : 58,
      "#c8fff0",
      "center",
    );
    text(
      s.screen === "paused"
        ? "THE ABYSS CAN WAIT"
        : s.screen === "cleared"
          ? "+500  /  DESCENDING"
          : String(Math.max(1, Math.ceil(2 - s.screenTime))),
      640,
      375,
      20,
      "#67b6af",
      "center",
    );
  }
  const items = menuItems(s);
  items.forEach((item, i) => {
    const r = menuItemRect(s, i)!;
    const selected = s.menuIndex === i;
    g.fillStyle = selected ? "#103330" : "#05151b";
    g.fillRect(r.x, r.y, r.w, r.h);
    g.strokeStyle = selected ? "#61d8bf" : "#173138";
    g.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (selected) {
      g.fillStyle = "#81ffe0";
      g.fillRect(r.x, r.y, 3, r.h);
    }
    text(
      (selected ? "›  " : "") + item,
      640,
      r.y + 31,
      18,
      selected ? "#b4ffe9" : "#67878e",
      "center",
    );
  });
}
