export class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;

  constructor(x: number, y: number, color: string) {
    this.x = x;
    this.y = y;
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 3 + 1;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.maxLife = Math.random() * 30 + 20;
    this.life = this.maxLife;
    this.color = color;
    this.size = Math.random() * 4 + 2;
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    this.vy += 0.1; // Gravity for particles
    this.life--;
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number = 0) {
    const opacity = this.life / this.maxLife;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 5;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(this.x - offsetX, this.y - offsetY, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
