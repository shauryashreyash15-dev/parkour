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

export const MAP_WIDTH = 4000;
export const MAP_HEIGHT = 1000;
export const GRAVITY = 0.6;
export const JUMP_FORCE = -12;
export const SPEED = 6;

export const LEVELS: Platform[][] = [
  // Level 1: Easy
  [
    { x: 0, y: 800, width: 800, height: 40 },
    { x: 900, y: 700, width: 300, height: 40 },
    { x: 1300, y: 600, width: 300, height: 40 },
    { x: 1700, y: 500, width: 300, height: 40 },
    { x: 2100, y: 400, width: 300, height: 40 },
    { x: 2500, y: 300, width: 400, height: 40, type: "goal" },
    { x: 800, y: 950, width: 3200, height: 50, type: "hazard" },
  ],
  // Level 2: Moderate
  [
    { x: 0, y: 800, width: 400, height: 40 },
    { x: 500, y: 700, width: 200, height: 40 },
    { x: 800, y: 600, width: 200, height: 40 },
    { x: 1100, y: 500, width: 200, height: 40 },
    { x: 1400, y: 650, width: 200, height: 40 },
    { x: 1700, y: 550, width: 200, height: 40 },
    { x: 2000, y: 450, width: 200, height: 40 },
    { x: 2300, y: 350, width: 400, height: 40, type: "goal" },
    { x: 400, y: 950, width: 3600, height: 50, type: "hazard" },
  ],
  // Level 3: Challenging
  [
    { x: 0, y: 800, width: 300, height: 40 },
    { x: 400, y: 650, width: 150, height: 40 },
    { x: 700, y: 500, width: 150, height: 40 },
    { x: 1000, y: 350, width: 150, height: 40 },
    { x: 1300, y: 500, width: 150, height: 40 },
    { x: 1600, y: 650, width: 150, height: 40 },
    { x: 1900, y: 500, width: 150, height: 40 },
    { x: 2200, y: 350, width: 150, height: 40 },
    { x: 2500, y: 200, width: 400, height: 40, type: "goal" },
    { x: 300, y: 950, width: 3700, height: 50, type: "hazard" },
  ],
  // Level 4: Hard
  [
    { x: 0, y: 800, width: 200, height: 40 },
    { x: 300, y: 650, width: 100, height: 40 },
    { x: 500, y: 500, width: 100, height: 40 },
    { x: 700, y: 350, width: 100, height: 40 },
    { x: 900, y: 500, width: 100, height: 40 },
    { x: 1100, y: 650, width: 100, height: 40 },
    { x: 1300, y: 500, width: 100, height: 40 },
    { x: 1500, y: 350, width: 100, height: 40 },
    { x: 1700, y: 200, width: 100, height: 40 },
    { x: 1900, y: 350, width: 100, height: 40 },
    { x: 2100, y: 500, width: 100, height: 40 },
    { x: 2300, y: 650, width: 100, height: 40 },
    { x: 2500, y: 500, width: 400, height: 40, type: "goal" },
    { x: 200, y: 950, width: 3800, height: 50, type: "hazard" },
  ],
  // Level 5: Extreme
  [
    { x: 0, y: 800, width: 150, height: 40 },
    { x: 250, y: 650, width: 80, height: 40 },
    { x: 450, y: 500, width: 80, height: 40 },
    { x: 650, y: 350, width: 80, height: 40 },
    { x: 850, y: 200, width: 80, height: 40 },
    { x: 1050, y: 350, width: 80, height: 40 },
    { x: 1250, y: 500, width: 80, height: 40 },
    { x: 1450, y: 650, width: 80, height: 40 },
    { x: 1650, y: 500, width: 80, height: 40 },
    { x: 1850, y: 350, width: 80, height: 40 },
    { x: 2050, y: 200, width: 80, height: 40 },
    { x: 2250, y: 350, width: 80, height: 40 },
    { x: 2450, y: 500, width: 80, height: 40 },
    { x: 2650, y: 650, width: 80, height: 40 },
    { x: 2850, y: 500, width: 400, height: 40, type: "goal" },
    { x: 150, y: 950, width: 3850, height: 50, type: "hazard" },
  ],
];
