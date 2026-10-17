import { describe, it, expect } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
} from "@clockwyrks/simple-2d";
import {
  game,
  debug,
  initial,
  flood,
  directions,
  neighbor,
  tile,
} from "./game";
import * as C from "./constants";

async function harness(step = 1000 / 60) {
  const target = new EventTarget();
  const engine = createEngine({
    canvas: createCanvas(C.STAGE_W, C.STAGE_H) as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    layout: C.LAYOUT,
    background: "#02090e",
    clock: new ConstantClock(step),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
    game: {
      ...game,
      initialize: (api) =>
        game.initialize({
          ...api,
          assets: {
            ...api.assets,
            loadImage: async (path) =>
              (await loadImage(
                new URL(`../assets/${path}`, import.meta.url).pathname,
              )) as unknown as ImageBitmap,
          },
        }),
    },
  });
  await engine.initialize();
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  return { engine, key };
}
const fixture = () =>
  Array.from({ length: C.GRID_ROWS }, (_, y) =>
    y === 4 ? "#" + ".".repeat(34) + "#" : "#".repeat(36),
  );

describe("maze contract", () => {
  it("is connected, mirrored, narrow, looped and dense with a sealed den", () => {
    const s = initial();
    let count = 0,
      degree = 0;
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = tile(s, x, y);
        if (t === ".") {
          count++;
          const n = directions.filter((d) => {
            const p = neighbor(s, x, y, d);
            return tile(s, p.tx, p.ty) === ".";
          }).length;
          expect(n).toBeGreaterThanOrEqual(2);
          degree += n;
          expect(
            !(
              tile(s, x + 1, y) === "." &&
              tile(s, x, y + 1) === "." &&
              tile(s, x + 1, y + 1) === "."
            ),
          ).toBe(true);
        }
        const mirror = tile(s, 35 - x, y);
        if (!"dg".includes(t) && !"dg".includes(mirror)) expect(t).toBe(mirror);
        if (t === "d")
          expect(
            directions.every((d) => {
              const p = neighbor(s, x, y, d);
              return tile(s, p.tx, p.ty) !== ".";
            }),
          ).toBe(true);
      }
    expect(count / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(degree / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    expect(flood(s, s.start.tx, s.start.ty).filter((n) => n >= 0)).toHaveLength(
      count,
    );
    const visited = new Set<number>(),
      runs: number[] = [];
    for (let i = 0; i < 648; i++) {
      const x = i % 36,
        y = Math.floor(i / 36);
      const deg = (x: number, y: number) =>
        directions.filter((d) => {
          const p = neighbor(s, x, y, d);
          return tile(s, p.tx, p.ty) === ".";
        }).length;
      if (tile(s, x, y) !== "." || deg(x, y) !== 2 || visited.has(i)) continue;
      const q = [i];
      visited.add(i);
      for (let j = 0; j < q.length; j++)
        for (const d of directions) {
          const p = neighbor(s, q[j] % 36, Math.floor(q[j] / 36), d),
            k = p.ty * 36 + p.tx;
          if (
            tile(s, p.tx, p.ty) === "." &&
            deg(p.tx, p.ty) === 2 &&
            !visited.has(k)
          ) {
            visited.add(k);
            q.push(k);
          }
        }
      runs.push(q.length);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
  });
});
describe("engine-driven dive", () => {
  it("navigates menus, countdown, pause and mute through registered actions", async () => {
    const { engine: e, key } = await harness();
    expect(e.state.screen).toBe("title");
    key("ArrowDown");
    await e.advance(1);
    key("ArrowDown", false);
    key("Enter");
    await e.advance(1);
    key("Enter", false);
    expect(e.state.screen).toBe("howto");
    key("Escape");
    await e.advance(1);
    key("Escape", false);
    expect(e.state.menuIndex).toBe(1);
    key("ArrowUp");
    await e.advance(1);
    key("ArrowUp", false);
    key("Enter");
    await e.advance(1);
    key("Enter", false);
    expect(e.state.screen).toBe("countdown");
    await e.advance(121);
    expect(e.state.screen).toBe("playing");
    key("Escape");
    await e.advance(1);
    key("Escape", false);
    expect(e.state.screen).toBe("paused");
    const x = e.state.forager.x;
    await e.advance(20);
    expect(e.state.forager.x).toBe(x);
    key("KeyM");
    await e.advance(1);
    expect(e.state.muted).toBe(true);
    e.destroy();
  });
  it("moves continuously, stops on release, eats, and keeps old state immutable", async () => {
    const { engine: e, key } = await harness();
    e.apply((s) => debug.setMaze(s, fixture()));
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.setForagerTile(s, 3, 4));
    e.apply((s) => debug.setPlankton(s, 4, 4, true));
    e.apply((s) => debug.setPlankton(s, 8, 4, true));
    e.apply((s) => debug.setScreen(s, "playing"));
    const before = e.state;
    key("ArrowRight");
    await e.advance(15);
    expect(e.state.forager.x - before.forager.x).toBeCloseTo(32);
    expect(e.state.score).toBe(C.SCORE_PLANKTON);
    expect(before.score).toBe(0);
    key("ArrowRight", false);
    await e.advance(10);
    expect(e.state.forager.x - before.forager.x).toBeCloseTo(32);
    e.destroy();
  });
  it("clears on eating the last mote and descends carrying score and lives", async () => {
    const { engine: e } = await harness();
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.setPlankton(s, s.forager.tx, s.forager.ty, true));
    e.apply((s) => debug.setScreen(s, "playing"));
    await e.advance(1);
    expect(e.state.screen).toBe("cleared");
    expect(e.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    await e.advance(121);
    expect(e.state.depth).toBe(2);
    expect(e.state.predators).toHaveLength(4);
    expect(e.state.screen).toBe("countdown");
    e.destroy();
  });
  it("treats zero reserve lives as the last attempt", async () => {
    const { engine: e } = await harness();
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.setLives(s, 0));
    e.apply((s) =>
      debug.addPredator(s, "gloamfin", s.forager.tx, s.forager.ty),
    );
    e.apply((s) => debug.setPredatorMind(s, 0, false));
    e.apply((s) => debug.setScreen(s, "playing"));
    await e.advance(1);
    expect(e.state.screen).toBe("gameover");
    e.destroy();
  });
  it("casts corridor sonar and ink with cooldowns, and hears through ink", async () => {
    const { engine: e, key } = await harness();
    e.apply((s) => debug.setMaze(s, fixture()));
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.setForagerTile(s, 3, 4));
    e.apply((s) => debug.addPredator(s, "gloamfin", 5, 4));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    e.apply((s) => debug.setScreen(s, "playing"));
    key("Space");
    key("ShiftLeft");
    await e.advance(1);
    expect(e.state.pulses[0].front).toBeGreaterThan(0);
    expect(e.state.inkClouds).toHaveLength(1);
    expect(e.state.predators[0].hearingLock).toBe(true);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.sonar.cooldown).toBeGreaterThan(1);
    await e.advance(100);
    expect(e.state.sonar.ready).toBe(true);
    e.destroy();
  });
  it("runs the same ticks across different frame partitions", async () => {
    const a = await harness(),
      b = await harness();
    b.engine.setClock(new SequenceClock([5, 25, 20]));
    await a.engine.advance(90);
    await b.engine.advance(90);
    expect(a.engine.state.simTime).toBeCloseTo(b.engine.state.simTime, 10);
    expect(a.engine.state.seed).toBe(b.engine.state.seed);
    a.engine.destroy();
    b.engine.destroy();
  });
  it("validates poses, preserves fog on reconcile, and returns JSON snapshots", () => {
    let s = initial();
    expect(() => debug.setBrightness(s, 2)).toThrow();
    expect(() => debug.setMaze(s, ["bad"])).toThrow();
    expect(() => debug.setMenuIndex(s, 7)).toThrow();
    s = debug.setDepth(s, 8);
    expect(s.predators).toHaveLength(6);
    expect(s.sonar.range).toBe(C.SONAR_RANGE_MIN);
    s = debug.setBrightness(s, 1);
    s = debug.clearFog(s);
    expect(debug.reconcile(s).visibility.join("")).toMatch(/^u+$/);
    expect(s.windowRadius).toBe(320);
    expect(JSON.parse(JSON.stringify(debug.snapshot(s))).version).toBe(1);
    expect(debug.reset(s).depth).toBe(1);
  });
});

describe("sensing and hunter behaviors", () => {
  it("remembers terrain while the circular window alone reveals nothing", async () => {
    const { engine: e } = await harness();
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.setScreen(s, "playing"));
    await e.advance(1);
    const old = e.state.forager;
    expect(e.state.visibility[old.ty][old.tx]).toBe("l");
    e.apply((s) => debug.setForagerTile(s, 1, 1));
    await e.advance(1);
    expect(e.state.visibility[old.ty][old.tx]).toBe("r");
    expect(e.state.visibility.join("")).toContain("u");
    e.destroy();
  });
  it("releases hunters in timed slots and leaves travel-disabled bodies in the den", async () => {
    const { engine: e } = await harness();
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    e.apply((s) => debug.setScreen(s, "playing"));
    await e.advance(1);
    expect(e.state.predators[0].released).toBe(true);
    expect(e.state.predators[0].state).toBe("den");
    expect(e.state.predators[1].released).toBe(false);
    await e.advance(300);
    expect(e.state.predators[1].released).toBe(true);
    e.destroy();
  });
  it("drops a visual chase immediately when ink obscures its sight", async () => {
    const { engine: e, key } = await harness();
    e.apply((s) => debug.setMaze(s, fixture()));
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.setForagerTile(s, 3, 4));
    e.apply((s) => debug.addPredator(s, "lanternjaw", 6, 4));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    e.apply((s) => debug.setScreen(s, "playing"));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    key("ShiftLeft");
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("wander");
    expect(e.state.predators[0].speed).toBe(C.DRIFTER_SPEED);
    e.destroy();
  });
  it("charges and blooms on the wander timer, revealing through rock", async () => {
    const { engine: e } = await harness();
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.addPredator(s, "flarefish", 4, 1));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    e.apply((s) => debug.setScreen(s, "playing"));
    await e.advance(425);
    expect(e.state.predators[0].flareCharging).toBe(true);
    await e.advance(30);
    expect(e.state.predators[0].flaring).toBe(true);
    expect(e.state.predators[0].flareRadius).toBe(C.FLARE_RADIUS);
    expect(e.state.visibility[0][4]).toBe("l");
    await e.advance(65);
    expect(e.state.predators[0].flaring).toBe(false);
    e.destroy();
  });
  it("wraps continuously across the tunnel at ordinary swim speed", async () => {
    const { engine: e, key } = await harness();
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.setForagerTile(s, 0, 13));
    e.apply((s) => debug.setScreen(s, "playing"));
    key("ArrowLeft");
    await e.advance(15);
    expect(e.state.forager.tx).toBe(35);
    expect(e.state.forager.x).toBeCloseTo(
      C.GRID_ORIGIN_X + (C.GRID_COLS - 0.5) * C.TILE,
    );
    e.destroy();
  });
  it("does not reveal the amber disguise with sonar alone", async () => {
    const { engine: e, key } = await harness();
    e.apply((s) => debug.setMaze(s, fixture()));
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.clearPlankton(s));
    e.apply((s) => debug.setForagerTile(s, 3, 4));
    e.apply((s) => debug.addPredator(s, "lanternjaw", 8, 4));
    e.apply((s) => debug.setPredatorMind(s, 0, false));
    e.apply((s) => debug.spawnDrifter(s, 8, 4));
    e.apply((s) => debug.setDrifterMind(s, 0, false));
    e.apply((s) => debug.setScreen(s, "playing"));
    key("Space");
    await e.advance(25);
    expect(e.state.visibility[4][8]).toBe("l");
    expect(e.state.predators[0].lit).toBe(false);
    expect(e.state.drifters[0].lit).toBe(false);
    e.destroy();
  });
});

it("lands cooldowns and brightness holds on their exact fixed tick", async () => {
  const { engine: e } = await harness(1000 / C.TICK_HZ);
  e.apply((s) => debug.clearPredators(s));
  e.apply((s) => debug.clearPlankton(s));
  e.apply((s) => debug.setScreen(s, "playing"));
  e.apply((s) => debug.setSonarCooldown(s, C.SONAR_COOLDOWN));
  e.apply((s) => debug.setBrightness(s, 1));
  e.apply((s) => debug.setBrightHold(s, C.BRIGHT_HOLD));
  await e.advance(C.TICK_HZ);
  expect(e.state.brightHold).toBe(0);
  expect(e.state.brightness).toBeCloseTo(1, 10);
  await e.advance(C.TICK_HZ / 2);
  expect(e.state.sonar.ready).toBe(true);
  expect(e.state.brightness).toBeCloseTo(0.5 ** (0.5 / C.BRIGHT_HALFLIFE), 10);
  e.destroy();
});
