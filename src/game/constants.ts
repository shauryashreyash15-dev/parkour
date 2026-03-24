export interface PlayerState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  name: string;
  facing: number; // 1 for right, -1 for left
  shape: "square" | "circle" | "triangle";
  expression: "neutral" | "happy" | "determined" | "surprised";
}

export interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
  type?: "normal" | "hazard" | "goal";
}

export const MAP_WIDTH = 6000;
export const MAP_HEIGHT = 3000;
export const GRAVITY = 0.5;
export const JUMP_FORCE = -14;
export const SPEED = 7;

export const LEVELS: Platform[][] = [
  // Level 1: The Ascent
  [
    { x: 0, y: 2800, width: 800, height: 40 },
    { x: 900, y: 2650, width: 300, height: 40 },
    { x: 1300, y: 2500, width: 300, height: 40 },
    { x: 1700, y: 2350, width: 300, height: 40 },
    { x: 2100, y: 2200, width: 300, height: 40 },
    { x: 2500, y: 2050, width: 300, height: 40 },
    { x: 2900, y: 1900, width: 300, height: 40 },
    { x: 3300, y: 1750, width: 300, height: 40 },
    { x: 3700, y: 1600, width: 300, height: 40 },
    { x: 4100, y: 1450, width: 300, height: 40 },
    { x: 4500, y: 1300, width: 400, height: 40, type: "goal" },
    { x: 0, y: 2950, width: 6000, height: 50, type: "hazard" },
  ],
  // Level 2: Zig Zag
  [
    { x: 0, y: 2800, width: 400, height: 40 },
    { x: 500, y: 2600, width: 200, height: 40 },
    { x: 200, y: 2400, width: 200, height: 40 },
    { x: 500, y: 2200, width: 200, height: 40 },
    { x: 800, y: 2000, width: 200, height: 40 },
    { x: 1100, y: 1800, width: 200, height: 40 },
    { x: 800, y: 1600, width: 200, height: 40 },
    { x: 500, y: 1400, width: 200, height: 40 },
    { x: 200, y: 1200, width: 200, height: 40 },
    { x: 500, y: 1000, width: 400, height: 40, type: "goal" },
    { x: 0, y: 2950, width: 6000, height: 50, type: "hazard" },
  ],
  // Level 3: The Void
  [
    { x: 0, y: 2800, width: 200, height: 40 },
    { x: 300, y: 2600, width: 100, height: 40 },
    { x: 600, y: 2400, width: 100, height: 40 },
    { x: 900, y: 2200, width: 100, height: 40 },
    { x: 1200, y: 2000, width: 100, height: 40 },
    { x: 1500, y: 1800, width: 100, height: 40 },
    { x: 1800, y: 1600, width: 100, height: 40 },
    { x: 2100, y: 1400, width: 100, height: 40 },
    { x: 2400, y: 1200, width: 100, height: 40 },
    { x: 2700, y: 1000, width: 400, height: 40, type: "goal" },
    { x: 0, y: 2950, width: 6000, height: 50, type: "hazard" },
  ],
];
