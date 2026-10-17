import type { Game, UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
import { render } from "./render";
export const BACKGROUND = "#03060c";
export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
  moving: boolean;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: C.PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertIn: number;
  mark: number;
  ping: number;
  lastPing: number;
  search: number;
  searchPing: boolean;
  flare: number;
  phase: number;
  fade: number;
  ramp: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number;
  hit: boolean;
  dist: number[];
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  sonarLit: number[];
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body;
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: { x: number; y: number; radius: number; remaining: number }[];
  simTime: number;
  accumulator: number;
  screenTime: number;
  playTime: number;
  desired: Direction;
  seed: number;
  start: { tx: number; ty: number };
  pointerItem: number | null;
  art: Record<string, ImageBitmap[]>;
}
export type { PredatorKind } from "./constants";

type Read = DeepReadonly<FathomState>;
export const directions: Direction[] = ["up", "right", "down", "left"];
export const vectors: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + tx * C.TILE + C.TILE / 2,
  y: C.GRID_ORIGIN_Y + ty * C.TILE + C.TILE / 2,
  tx,
  ty,
});
const body = (tx: number, ty: number): Body => ({
  ...center(tx, ty),
  dir: "up",
  moving: false,
});
export const tile = (s: Read, x: number, y: number) => s.tiles[y]?.[x] ?? "#";
// Bitmaps are immutable engine resources; copy the mutable simulation layers.
// All mutation below is confined to this newly built next-state value.
const clone = (s: Read): FathomState => ({
  ...s,
  art: s.art as Record<string, ImageBitmap[]>,
  grid: { ...s.grid },
  sonar: { ...s.sonar },
  ink: { ...s.ink },
  forager: { ...s.forager },
  start: { ...s.start },
  sonarLit: [...s.sonarLit],
  tiles: [...s.tiles],
  plankton: [...s.plankton],
  visibility: [...s.visibility],
  predators: s.predators.map((p) => ({
    ...p,
    fix: p.fix ? { ...p.fix } : null,
  })),
  drifters: s.drifters.map((d) => ({ ...d })),
  pulses: s.pulses.map((p) => ({ ...p, dist: [...p.dist] })),
  inkClouds: s.inkClouds.map((i) => ({ ...i })),
});
function layer(ch: string) {
  return Array.from({ length: C.GRID_ROWS }, () => ch.repeat(C.GRID_COLS));
}
function put(rows: string[], x: number, y: number, ch: string) {
  rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1);
}
function maze() {
  const a = layer("#");
  for (let y = 1; y < 17; y++)
    for (let x = 1; x < 35; x++)
      if (
        [1, 5, 9, 13, 16].includes(y) ||
        [1, 4, 7, 10, 13, 22, 25, 28, 31, 34].includes(x)
      )
        put(a, x, y, ".");
  for (let y = 6; y <= 10; y++)
    for (let x = 14; x <= 21; x++) put(a, x, y, "#");
  for (let y = 7; y <= 9; y++) for (let x = 16; x <= 19; x++) put(a, x, y, "d");
  put(a, 17, 6, "g");
  put(a, 0, 13, ".");
  put(a, 35, 13, ".");
  return a;
}
function predator(
  kind: C.PredatorKind,
  tx: number,
  ty: number,
  slot: number | null,
): Predator {
  return {
    ...body(tx, ty),
    kind,
    state: slot === null ? "wander" : "den",
    released: slot === null,
    mind: true,
    travel: true,
    lit: false,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertIn: 0,
    mark: 0,
    ping: C.GLOAMFIN_PING_INTERVAL,
    lastPing: -100,
    search: 0,
    searchPing: false,
    flare: C.FLARE_INTERVAL,
    phase: 0,
    fade: 0,
    ramp: C.GLOAMFIN_CHASE_SPEED,
    slot,
  };
}
function roster(depth: number) {
  return [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ].map((k, i) => predator(k, 16 + (i % 4), 8 + Math.floor(i / 4), i));
}
export function initial(
  art: Record<string, ImageBitmap[]> = {},
  muted = false,
): FathomState {
  const tiles = maze();
  return reconcile({
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    sonarLit: Array(C.GRID_COLS * C.GRID_ROWS).fill(0),
    tiles,
    plankton: tiles.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: body(13, 13),
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    accumulator: 0,
    screenTime: 0,
    playTime: 0,
    desired: "up",
    seed: 27183,
    start: { tx: 13, ty: 13 },
    pointerItem: null,
    art,
  });
}
function coords(b: Body) {
  b.tx = Math.max(
    0,
    Math.min(C.GRID_COLS - 1, Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE)),
  );
  b.ty = Math.max(
    0,
    Math.min(C.GRID_ROWS - 1, Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE)),
  );
}
export function reconcile(state: Read) {
  const s = clone(state);
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(C.SONAR_RANGE_MIN, C.SONAR_RANGE_BASE - s.depth + 1);
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  coords(s.forager);
  for (const b of [...s.predators, ...s.drifters]) coords(b);
  for (const p of s.predators) {
    p.speed =
      p.kind === "lanternjaw" && p.state !== "chase"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.ramp
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  }
  return s;
}
export function neighbor(s: Read, x: number, y: number, d: Direction) {
  const [dx, dy] = vectors[d];
  let nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || nx >= C.GRID_COLS) {
    const row = s.tiles.findIndex(
      (r) => r[0] !== "#" && r[C.GRID_COLS - 1] !== "#",
    );
    if (y !== row) return { tx: nx, ty: ny };
    nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  }
  return { tx: nx, ty: ny };
}
const open = (s: Read, x: number, y: number, den = false) =>
  den ? ".dg".includes(tile(s, x, y)) : tile(s, x, y) === ".";
/** Corridor distances serve both shortest-route pursuit and travelling sonar. */
export function flood(s: Read, x: number, y: number, den = false) {
  const dist = Array<number>(C.GRID_COLS * C.GRID_ROWS).fill(-1);
  const q = [{ tx: x, ty: y }];
  if (!open(s, x, y, den)) return dist;
  dist[y * C.GRID_COLS + x] = 0;
  for (let i = 0; i < q.length; i++) {
    const b = q[i];
    for (const d of directions) {
      const n = neighbor(s, b.tx, b.ty, d),
        idx = n.ty * C.GRID_COLS + n.tx;
      if (open(s, n.tx, n.ty, den) && dist[idx] === -1) {
        dist[idx] = dist[b.ty * C.GRID_COLS + b.tx] + 1;
        q.push(n);
      }
    }
  }
  return dist;
}
// Timers land on zero at the intended tick despite floating-point subtraction.
const countdown = (value: number) =>
  value <= C.TICK_DT + 1e-10 ? 0 : value - C.TICK_DT;

function random(s: FathomState) {
  s.seed = (s.seed * 1664525 + 1013904223) >>> 0;
  return s.seed / 4294967296;
}
function choose(
  s: FathomState,
  b: Body,
  target: { tx: number; ty: number } | null,
  den = false,
) {
  const opts = directions.filter((d) => {
    const n = neighbor(s, b.tx, b.ty, d);
    return open(s, n.tx, n.ty, den);
  });
  if (target) {
    const dist = flood(s, target.tx, target.ty, den);
    opts.sort((a, bdir) => {
      const a1 = neighbor(s, b.tx, b.ty, a),
        b1 = neighbor(s, b.tx, b.ty, bdir);
      const da = dist[a1.ty * C.GRID_COLS + a1.tx],
        db = dist[b1.ty * C.GRID_COLS + b1.tx];
      return (da < 0 ? 9999 : da) - (db < 0 ? 9999 : db);
    });
    return opts[0] ?? b.dir;
  }
  const non = opts.filter(
    (d) => d !== directions[(directions.indexOf(b.dir) + 2) % 4],
  );
  const pool = non.length ? non : opts;
  return pool[Math.floor(random(s) * pool.length)] ?? b.dir;
}
/** Spend a tick's distance in segments, stopping exactly at every turn center. */
function move(
  s: FathomState,
  b: Body,
  speed: number,
  select: () => Direction,
  den = false,
) {
  if (!open(s, b.tx, b.ty, den)) {
    b.moving = false;
    return;
  }
  let left = speed * C.TICK_DT;
  b.moving = false;
  while (left > 1e-8) {
    const c = center(b.tx, b.ty);
    const at = Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) < 1e-6;
    if (at) {
      b.dir = select();
      const n = neighbor(s, b.tx, b.ty, b.dir);
      if (!open(s, n.tx, n.ty, den)) break;
    }
    const [dx, dy] = vectors[b.dir];
    let dist = dx ? (c.x - b.x) * dx : (c.y - b.y) * dy;
    if (dist <= 1e-7) dist += C.TILE;
    const step = Math.min(left, dist);
    b.x += dx * step;
    b.y += dy * step;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x > C.GRID_ORIGIN_X + width) b.x -= width;
    coords(b);
    left -= step;
    b.moving = true;
  }
}
export function los(
  s: Read,
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const n = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 4);
  for (let i = 1; i < n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n,
      y = a.y + ((b.y - a.y) * i) / n;
    const tx = Math.floor((x - C.GRID_ORIGIN_X) / C.TILE),
      ty = Math.floor((y - C.GRID_ORIGIN_Y) / C.TILE);
    const bx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE),
      by = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
    if (tile(s, tx, ty) === "#" && (tx !== bx || ty !== by)) return false;
  }
  return true;
}
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);
function blinded(s: FathomState, p: Predator) {
  return s.inkClouds.some((c) => {
    const f = s.forager,
      dx = f.x - p.x,
      dy = f.y - p.y,
      t = Math.max(
        0,
        Math.min(
          1,
          ((c.x - p.x) * dx + (c.y - p.y) * dy) / (dx * dx + dy * dy || 1),
        ),
      );
    return Math.hypot(c.x - p.x - t * dx, c.y - p.y - t * dy) <= c.radius;
  });
}
function acquire(s: FathomState, p: Predator) {
  if (p.state !== "chase") {
    p.alertIn = p.kind === "lanternjaw" ? 0 : C.ALERT_TIME;
    p.ramp = C.GLOAMFIN_CHASE_SPEED;
  }
  p.state = "chase";
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  const wanted = choose(s, p, p.fix);
  if (wanted === directions[(directions.indexOf(p.dir) + 2) % 4])
    p.dir = wanted;
  p.linger = C.LINGER_TIME;
  if (p.phase >= C.FLARE_CHARGE) p.fade = 0.3;
  p.phase = 0;
}
function pulse(
  s: FathomState,
  b: Body,
  owner = -1,
  tint: Pulse["tint"] = "cyan",
) {
  s.pulses.push({
    source: owner < 0 ? "forager" : "gloamfin",
    tint,
    ox: b.tx,
    oy: b.ty,
    front: 0,
    range: owner < 0 ? s.sonar.range : C.GLOAMFIN_PING_RANGE,
    owner,
    hit: false,
    dist: flood(s, b.tx, b.ty),
  });
}
function setScreen(s: FathomState, screen: Screen) {
  s.screen = screen;
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
  s.screenTime = 0;
  if (screen === "playing" && s.playTime === 0) s.playTime = 0;
}
function fresh(s: FathomState, screen: Screen) {
  const n = initial(s.art, s.muted);
  n.titleIndex = s.titleIndex;
  n.simTime = s.simTime;
  setScreen(n, screen);
  return n;
}
function attempt(s: FathomState) {
  s.forager = body(s.start.tx, s.start.ty);
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.playTime = 0;
  setScreen(s, "countdown");
}
// Rebuild transient lighting without discarding the maze's accumulated memory.
function light(s: FathomState) {
  s.visibility = s.visibility.map((r) => r.replace(/l/g, "r"));
  const flares = s.predators.filter((p) => p.flaring);
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const c = center(x, y);
      if (
        s.sonarLit[y * C.GRID_COLS + x] > 0 ||
        (distance(c, s.forager) <= s.visionRadius && los(s, s.forager, c)) ||
        flares.some((p) => distance(p, c) <= C.FLARE_RADIUS)
      )
        put(s.visibility, x, y, "l");
    }
  const bodyLit = (b: { x: number; y: number }) =>
    (distance(b, s.forager) <= s.visionRadius && los(s, s.forager, b)) ||
    flares.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  for (const p of s.predators) {
    p.alert = p.alertIn > 0;
    p.lit =
      p.state !== "den" &&
      (p.alert || (p.kind !== "lanternjaw" && p.mark > 0) || bodyLit(p));
  }
  for (const d of s.drifters) d.lit = bodyLit(d);
}
/** Render-free, deterministic simulation. Only this function advances clocks. */
export function tick(
  s: FathomState,
  held: Direction[],
  events: Set<C.CueName>,
) {
  s.simTime += C.TICK_DT;
  s.screenTime += C.TICK_DT;
  if (s.screen === "countdown") {
    light(s);
    if (s.screenTime + 1e-10 >= 2) setScreen(s, "playing");
    return;
  }
  if (s.screen === "cleared") {
    if (s.screenTime + 1e-10 >= 2) {
      const n = initial(s.art, s.muted);
      n.depth = s.depth + 1;
      n.score = s.score;
      n.lives = s.lives;
      n.titleIndex = s.titleIndex;
      n.simTime = s.simTime;
      n.predators = roster(n.depth);
      Object.assign(s, n);
      setScreen(s, "countdown");
    }
    return;
  }
  if (s.screen !== "playing") return;
  s.playTime += C.TICK_DT;
  s.sonarLit = s.sonarLit.map((t) => Math.max(0, t - C.TICK_DT));
  s.sonar.cooldown = countdown(s.sonar.cooldown);
  s.ink.cooldown = countdown(s.ink.cooldown);
  const heldFor = Math.min(s.brightHold, C.TICK_DT);
  s.brightHold = countdown(s.brightHold);
  s.brightness *= 0.5 ** ((C.TICK_DT - heldFor) / C.BRIGHT_HALFLIFE);
  if (held.length) {
    s.desired = held[held.length - 1];
    const f = s.forager;
    if (directions[(directions.indexOf(f.dir) + 2) % 4] === s.desired)
      f.dir = s.desired;
    move(s, f, C.FORAGER_SPEED, () => {
      const n = neighbor(s, f.tx, f.ty, s.desired);
      return open(s, n.tx, n.ty) ? s.desired : f.dir;
    });
  } else s.forager.moving = false;
  const f = s.forager;
  if (s.plankton[f.ty]?.[f.tx] === "*") {
    put(s.plankton, f.tx, f.ty, "-");
    s.score += C.SCORE_PLANKTON;
    s.planktonRemaining--;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    events.add(C.CUES.eat);
    if (!s.planktonRemaining) {
      s.score += C.SCORE_CLEAR;
      events.add(C.CUES.descend);
      setScreen(s, "cleared");
      return;
    }
  }
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: c.remaining - C.TICK_DT }))
    .filter((c) => c.remaining > 0);
  for (const w of s.pulses) {
    const old = w.front;
    w.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    for (let i = 0; i < w.dist.length; i++) {
      const d = w.dist[i];
      if (d < 0 || d > w.range || d > w.front || (d <= old && old !== 0))
        continue;
      const x = i % C.GRID_COLS,
        y = Math.floor(i / C.GRID_COLS);
      if (w.source === "forager") {
        s.sonarLit[i] = C.SONAR_MARK_TIME;
        put(s.visibility, x, y, "l");
        for (const dir of directions) {
          const n = neighbor(s, x, y, dir);
          if (
            tile(s, n.tx, n.ty) === "#" &&
            n.tx >= 0 &&
            n.tx < C.GRID_COLS &&
            n.ty >= 0 &&
            n.ty < C.GRID_ROWS
          ) {
            put(s.visibility, n.tx, n.ty, "l");
            s.sonarLit[n.ty * C.GRID_COLS + n.tx] = C.SONAR_MARK_TIME;
          }
        }
        for (const p of s.predators)
          if (p.tx === x && p.ty === y && p.state !== "den") {
            if (p.kind !== "lanternjaw") p.mark = C.SONAR_MARK_TIME;
            if (p.kind === "gloamfin" && p.mind) acquire(s, p);
          }
      } else if (!w.hit && f.tx === x && f.ty === y) {
        const p = s.predators[w.owner];
        if (p?.mind) {
          acquire(s, p);
          w.hit = true;
        }
      }
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
  for (let i = 0; i < s.predators.length; i++) {
    const p = s.predators[i];
    p.fade = countdown(p.fade);
    p.alertIn = countdown(p.alertIn);
    p.mark = countdown(p.mark);
    if (p.slot !== null && s.playTime >= p.slot * C.DEN_RELEASE_GAP)
      p.released = true;
    if (!p.mind) continue;
    if (p.state === "den") {
      const gate = s.tiles.flatMap((r, y) =>
        [...r].flatMap((v, x) => (v === "g" ? [{ tx: x, ty: y }] : [])),
      )[0];
      if (!p.released || !gate) continue;
      if (p.travel)
        move(
          s,
          p,
          C.PREDATOR_SPEED,
          () => choose(s, p, { tx: gate.tx, ty: gate.ty - 1 }, true),
          true,
        );
      if (tile(s, p.tx, p.ty) === ".") p.state = "wander";
      continue;
    }
    if (p.kind === "gloamfin") {
      p.hearingLock = distance(p, f) <= C.GLOAMFIN_HEAR;
      if (p.hearingLock) acquire(s, p);
      p.ping -= C.TICK_DT;
      const special =
        p.state === "search" &&
        p.search >= C.GLOAMFIN_SEARCH_DELAY &&
        !p.searchPing;
      if (
        (p.ping <= 0 || special) &&
        !p.hearingLock &&
        s.simTime - p.lastPing >= C.GLOAMFIN_PING_MIN_GAP
      ) {
        pulse(s, p, i, special ? "orange" : "violet");
        p.lastPing = s.simTime;
        p.ping = C.GLOAMFIN_PING_INTERVAL;
        if (special) p.searchPing = true;
        events.add(C.CUES.predatorPing);
      }
      if (
        p.state === "chase" &&
        p.fix &&
        p.tx === p.fix.tx &&
        p.ty === p.fix.ty &&
        !p.hearingLock
      ) {
        p.state = "search";
        p.search = 0;
        p.searchPing = false;
      }
      if (p.state === "search") {
        p.search += C.TICK_DT;
        if (p.search >= C.GLOAMFIN_GIVEUP) {
          p.state = "wander";
          p.fix = null;
        }
      }
      p.ramp = Math.min(
        C.GLOAMFIN_CHASE_SPEED,
        p.ramp +
          ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
            C.GLOAMFIN_RAMP_TIME,
      );
    } else {
      const blind = blinded(s, p);
      const sense =
        !blind &&
        ((distance(p, f) <=
          C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness &&
          los(s, p, f)) ||
          (p.flaring && distance(p, f) <= C.FLARE_RADIUS));
      if (sense) acquire(s, p);
      else if (p.state === "chase") {
        p.linger -= C.TICK_DT;
        if (blind || p.linger <= 0) {
          p.state = "wander";
          p.fix = null;
          p.flare = C.FLARE_INTERVAL;
        }
      }
      if (p.kind === "flarefish") {
        if (p.state === "wander") {
          if (p.phase > 0) {
            p.phase += C.TICK_DT;
            if (p.phase >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
              p.phase = 0;
              p.fade = 0.3;
              p.flare = C.FLARE_INTERVAL;
            }
          } else {
            p.flare -= C.TICK_DT;
            if (p.flare <= 0) p.phase = C.TICK_DT;
          }
        }
        p.flareCharging = p.phase > 0 && p.phase < C.FLARE_CHARGE;
        p.flaring = p.phase >= C.FLARE_CHARGE;
        p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
        if (p.flaring && p.phase < C.FLARE_CHARGE + C.TICK_DT * 1.1)
          events.add(C.CUES.flare);
      }
    }
    if (
      p.travel &&
      !(
        p.state === "chase" &&
        p.fix &&
        distance(p, center(p.fix.tx, p.fix.ty)) < 0.01
      )
    ) {
      const old = p.dir;
      move(
        s,
        p,
        p.kind === "lanternjaw" && p.state === "wander"
          ? C.DRIFTER_SPEED
          : p.kind === "gloamfin" && p.state === "chase"
            ? p.ramp
            : C.PREDATOR_SPEED,
        () => {
          if (p.state === "chase" && p.fix) return choose(s, p, p.fix);
          if (
            p.state === "search" &&
            p.fix &&
            Math.abs(p.tx - p.fix.tx) + Math.abs(p.ty - p.fix.ty) >=
              C.GLOAMFIN_SEARCH_ROAM
          )
            return choose(s, p, p.fix);
          return choose(s, p, null);
        },
      );
      if (
        p.kind === "gloamfin" &&
        p.state === "chase" &&
        vectors[old][0] !== vectors[p.dir][0] &&
        vectors[old][1] !== vectors[p.dir][1]
      )
        p.ramp = C.GLOAMFIN_CORNER_SPEED;
    }
  }
  s.drifterIn = countdown(s.drifterIn);
  if (
    s.drifterIn === 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const y = s.tiles.findIndex((r) => r.includes("g"));
    if (y >= 0) {
      const x = s.tiles[y].indexOf("g");
      s.drifters.push({
        ...body(x, y - 1),
        mind: true,
        travel: true,
        lit: false,
      });
    }
    s.drifterIn = C.DRIFTER_INTERVAL;
  }
  for (const d of s.drifters)
    if (d.mind && d.travel)
      move(s, d, C.DRIFTER_SPEED, () => choose(s, d, null));
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === f.tx && d.ty === f.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  if (
    s.predators.some((p) => p.state !== "den" && p.tx === f.tx && p.ty === f.ty)
  ) {
    events.add(C.CUES.caught);
    if (s.lives === 0) setScreen(s, "gameover");
    else {
      s.lives--;
      attempt(s);
    }
  }
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  light(s);
}
export const menuItems = (s: Read) =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
export function menuItemRect(s: Read, i: number) {
  return Number.isInteger(i) && i >= 0 && i < menuItems(s).length
    ? { x: 470, y: 410 + i * 58, w: 340, h: 48 }
    : null;
}
function confirm(s: FathomState) {
  const i = s.menuIndex;
  if (s.screen === "title") {
    s.titleIndex = i ?? 0;
    if (i === 1) setScreen(s, "howto");
    else return fresh(s, "countdown");
  } else if (s.screen === "paused") {
    if (i === 0) setScreen(s, "playing");
    else if (i === 1) return fresh(s, "countdown");
    else return fresh(s, "title");
  } else if (s.screen === "gameover")
    return fresh(s, i === 0 ? "countdown" : "title");
  return s;
}
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const a of C.ACTIONS)
      api.input.register(a, { keys: [...C.BINDINGS[a]] });
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i % 2 ? "triangle" : "sine",
        freq: 180 + i * 110,
        freqTo: 80 + i * 70,
        gain: 0.12,
        durationMs: 100 + i * 35,
      }),
    );
    const art: Record<string, ImageBitmap[]> = {};
    await Promise.all(
      [
        ["glimmerfin", 8],
        ["lanternjaw", 16],
        ["gloamfin", 8],
        ["flarefish", 8],
        ["drifter", 8],
        ["flare-bloom", 8],
        ["trench-walls", 19],
      ].map(async ([name, count]) => {
        art[name] = await Promise.all(
          Array.from({ length: Number(count) }, (_, i) =>
            api.assets.loadImage(`${name}/${i}.png`),
          ),
        );
      }),
    );
    for (const key of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register(
      "cooldowns",
      (s) => `${s.sonar.cooldown.toFixed(2)} / ${s.ink.cooldown.toFixed(2)}`,
    );
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < 6; i++)
      api.diagnostics.register(`hunter ${i + 1}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(0)} alert:${p.alert}`
          : "—";
      });
    return [initial(art), debug];
  },
  update(state, api, dt) {
    let s = clone(state);
    if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    s = controls(s, api);
    s.accumulator += dt;
    const held = directions.filter((d) => api.input.value(d) > 0);
    while (s.accumulator + 1e-10 >= C.TICK_DT) {
      s.accumulator -= C.TICK_DT;
      const cues = new Set<C.CueName>();
      tick(s, held, cues);
      for (const c of cues) api.audio.play(c);
    }
    return reconcile(s);
  },
  render,
};
function controls(s: FathomState, api: UpdateApi) {
  const input = api.input;
  if (s.screen === "playing") {
    if (input.pressed("pause")) {
      setScreen(s, "paused");
      return s;
    }
    if (input.pressed("a") && s.sonar.cooldown === 0) {
      pulse(s, s.forager);
      s.sonar.cooldown = C.SONAR_COOLDOWN;
      api.audio.play(C.CUES.sonar);
    }
    if (input.pressed("b") && s.ink.cooldown === 0) {
      s.inkClouds.push({
        x: s.forager.x,
        y: s.forager.y,
        radius: C.INK_RADIUS,
        remaining: C.INK_LIFE,
      });
      s.ink.cooldown = C.INK_COOLDOWN;
      api.audio.play(C.CUES.ink);
    }
    return s;
  }
  if (
    s.screen === "paused" &&
    (input.pressed("pause") || input.pressed("back"))
  ) {
    setScreen(s, "playing");
    return s;
  }
  if (s.screen === "howto") {
    if (input.pointerPressed()) s.pointerItem = 0;
    if (
      input.pressed("confirm") ||
      input.pressed("back") ||
      (input.pointerReleased() && s.pointerItem === 0)
    )
      return fresh(s, "title");
    return s;
  }
  const items = menuItems(s);
  if (!items.length) return s;
  if (input.pressed("up"))
    s.menuIndex = ((s.menuIndex ?? 0) + items.length - 1) % items.length;
  if (input.pressed("down"))
    s.menuIndex = ((s.menuIndex ?? 0) + 1) % items.length;
  for (const sample of input.pointerSamples()) {
    if (!sample.primary) continue;
    const i = items.findIndex((_, i) => {
      const r = menuItemRect(s, i)!;
      return (
        sample.x >= r.x &&
        sample.x <= r.x + r.w &&
        sample.y >= r.y &&
        sample.y <= r.y + r.h
      );
    });
    if (i >= 0) s.menuIndex = i;
    if (sample.type === "down") s.pointerItem = i;
    if (sample.type === "up") {
      const yes = i >= 0 && s.pointerItem === i;
      s.pointerItem = null;
      if (yes) return confirm(s);
    }
  }
  if (input.pressed("confirm")) return confirm(s);
  if (input.pressed("back") && s.screen === "gameover")
    return fresh(s, "title");
  return s;
}
function valid(ok: boolean) {
  if (!ok) throw new RangeError("Invalid Fathom pose");
}
function num(n: number, min = 0, max = Infinity, integer = false) {
  valid(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function at(s: Read, x: number, y: number, den = false) {
  num(x, 0, C.GRID_COLS - 1, true);
  num(y, 0, C.GRID_ROWS - 1, true);
  valid(open(s, x, y, den));
}
function pose(s: Read, fn: (s: FathomState) => void) {
  const n = clone(s);
  fn(n);
  return reconcile(n);
}
function pred(s: FathomState, i: number) {
  num(i, 0, s.predators.length - 1, true);
  return s.predators[i];
}
function drift(s: FathomState, i: number) {
  num(i, 0, s.drifters.length - 1, true);
  return s.drifters[i];
}
function dir(d: Direction) {
  valid(directions.includes(d));
}
// Every pose copies first, validates its subject, and refreshes derived readings.
// Reconciliation deliberately does not run sensing, contact, or any clock.
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: Read) => initial(s.art as Record<string, ImageBitmap[]>, s.muted),
  snapshot: (s: Read) => {
    const {
      art: _art,
      accumulator: _a,
      screenTime: _t,
      playTime: _p,
      desired: _d,
      seed: _s,
      start: _st,
      pointerItem: _pi,
      sonarLit: _sl,
      ...n
    } = clone(s);
    return {
      ...n,
      forager: { ...s.forager },
      predators: s.predators.map((p) => ({
        kind: p.kind,
        x: p.x,
        y: p.y,
        tx: p.tx,
        ty: p.ty,
        dir: p.dir,
        state: p.state,
        released: p.released,
        mind: p.mind,
        travel: p.travel,
        speed: p.speed,
        alert: p.alert,
        lit: p.lit,
        detectRange: p.detectRange,
        hearingRange: p.hearingRange,
        hearingLock: p.hearingLock,
        flareCharging: p.flareCharging,
        flaring: p.flaring,
        flareRadius: p.flareRadius,
      })),
      drifters: s.drifters.map((d) => ({
        x: d.x,
        y: d.y,
        tx: d.tx,
        ty: d.ty,
        lit: d.lit,
        mind: d.mind,
        travel: d.travel,
      })),
      pulses: s.pulses.map((p) => ({
        source: p.source,
        tint: p.tint,
        ox: p.ox,
        oy: p.oy,
        front: p.front,
        range: p.range,
      })),
    };
  },
  reconcile,
  setScreen: (s: Read, v: Screen) =>
    pose(s, (n) => {
      valid(
        [
          "title",
          "howto",
          "countdown",
          "playing",
          "paused",
          "cleared",
          "gameover",
        ].includes(v),
      );
      setScreen(n, v);
    }),
  setMenuIndex: (s: Read, i: number) =>
    pose(s, (n) => {
      num(i, 0, menuItems(n).length - 1, true);
      n.menuIndex = i;
    }),
  setTitleIndex: (s: Read, i: number) =>
    pose(s, (n) => {
      num(i, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = i;
    }),
  menuItemRect,
  setScore: (s: Read, v: number) =>
    pose(s, (n) => {
      num(v, 0, Infinity, true);
      n.score = v;
    }),
  setLives: (s: Read, v: number) =>
    pose(s, (n) => {
      num(v, 0, Infinity, true);
      n.lives = v;
    }),
  setDepth: (s: Read, v: number) =>
    pose(s, (n) => {
      num(v, 1, Infinity, true);
      n.depth = v;
      n.predators = roster(v);
    }),
  setMaze: (s: Read, rows: string[]) =>
    pose(s, (n) => {
      valid(
        rows.length === C.GRID_ROWS &&
          rows.every((r) => r.length === C.GRID_COLS && /^[#.dg]+$/.test(r)),
      );
      const g = rows.join("").split("g").length - 1;
      valid(!/[dg]/.test(rows.join("")) || g === 1);
      n.tiles = [...rows];
      n.pulses = n.pulses.map((p) => ({ ...p, dist: flood(n, p.ox, p.oy) }));
    }),
  setPlankton: (s: Read, x: number, y: number, present: boolean) =>
    pose(s, (n) => {
      at(n, x, y);
      valid(typeof present === "boolean");
      put(n.plankton, x, y, present ? "*" : "-");
    }),
  clearPlankton: (s: Read) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s: Read) =>
    pose(s, (n) => {
      n.visibility = layer("u");
      n.sonarLit.fill(0);
    }),
  setForagerTile: (s: Read, x: number, y: number) =>
    pose(s, (n) => {
      at(n, x, y);
      Object.assign(n.forager, center(x, y), { moving: false });
    }),
  setForagerDir: (s: Read, d: Direction) =>
    pose(s, (n) => {
      dir(d);
      n.forager.dir = d;
      n.desired = d;
      n.forager.moving = false;
    }),
  setBrightness: (s: Read, v: number) =>
    pose(s, (n) => {
      num(v, 0, 1);
      n.brightness = v;
    }),
  setBrightHold: (s: Read, v: number) =>
    pose(s, (n) => {
      num(v, 0, C.BRIGHT_HOLD);
      n.brightHold = v;
    }),
  clearPredators: (s: Read) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: Read, k: C.PredatorKind, x: number, y: number) =>
    pose(s, (n) => {
      valid(C.DEN_ORDER.includes(k));
      at(n, x, y);
      n.predators.push(predator(k, x, y, null));
    }),
  setPredatorTile: (s: Read, i: number, x: number, y: number) =>
    pose(s, (n) => {
      at(n, x, y, true);
      Object.assign(pred(n, i), center(x, y));
    }),
  setPredatorDir: (s: Read, i: number, d: Direction) =>
    pose(s, (n) => {
      dir(d);
      pred(n, i).dir = d;
    }),
  setPredatorState: (s: Read, i: number, v: "den" | "wander" | "chase") =>
    pose(s, (n) => {
      const p = pred(n, i);
      valid(["den", "wander", "chase"].includes(v));
      valid(
        v === "den"
          ? "dg".includes(tile(n, p.tx, p.ty))
          : tile(n, p.tx, p.ty) === ".",
      );
      p.state = v;
      p.fix = v === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = v === "chase" ? C.LINGER_TIME : 0;
    }),
  setPredatorReleased: (s: Read, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      pred(n, i).released = v;
    }),
  setPredatorMind: (s: Read, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      pred(n, i).mind = v;
    }),
  setPredatorTravel: (s: Read, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      pred(n, i).travel = v;
    }),
  spawnDrifter: (s: Read, x: number, y: number) =>
    pose(s, (n) => {
      at(n, x, y);
      n.drifters.push({ ...body(x, y), lit: false, mind: true, travel: true });
    }),
  clearDrifters: (s: Read) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: Read, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      drift(n, i).mind = v;
    }),
  setDrifterTravel: (s: Read, i: number, v: boolean) =>
    pose(s, (n) => {
      valid(typeof v === "boolean");
      drift(n, i).travel = v;
    }),
  setDrifterIn: (s: Read, v: number) =>
    pose(s, (n) => {
      num(v, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = v;
    }),
  setSonarCooldown: (s: Read, v: number) =>
    pose(s, (n) => {
      num(v);
      n.sonar.cooldown = v;
    }),
  setInkCooldown: (s: Read, v: number) =>
    pose(s, (n) => {
      num(v);
      n.ink.cooldown = v;
    }),
};
export type FathomDebugApi = typeof debug;
