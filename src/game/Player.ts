import { PlayerState, LEVELS, GRAVITY, JUMP_FORCE, SPEED, MAP_WIDTH, MAP_HEIGHT, Platform } from "./constants";

export class GamePlayer {
  state: PlayerState;
  isLocal: boolean;
  canDoubleJump: boolean = true;
  isGrounded: boolean = false;
  width: number = 30;
  height: number = 50;
  reachedGoal: boolean = false;
  isDead: boolean = false;
  
  // Squash and stretch
  scaleX: number = 1;
  scaleY: number = 1;
  
  // Emotes
  activeEmote: string | null = null;
  emoteTimer: number = 0;
  
  onJump?: () => void;
  onDoubleJump?: () => void;
  onLand?: () => void;
  onDeath?: () => void;

  constructor(id: string, x: number, y: number, color: string, name: string, isLocal: boolean = false, shape: "square" | "circle" | "triangle" = "square") {
    this.state = { 
      id, x, y, vx: 0, vy: 0, color, name, facing: 1, 
      shape, 
      expression: "neutral" 
    };
    this.isLocal = isLocal;
  }

  setEmote(emote: string) {
    this.activeEmote = emote;
    this.emoteTimer = 120; // 2 seconds at 60fps
  }

  update(platforms: Platform[]) {
    if (!this.isLocal || this.isDead) return;

    // Apply gravity
    this.state.vy += GRAVITY;
    this.state.x += this.state.vx;
    this.state.y += this.state.vy;

    const wasGrounded = this.isGrounded;
    this.isGrounded = false;
    this.reachedGoal = false;

    // Collision detection
    for (const platform of platforms) {
      if (
        this.state.x < platform.x + platform.width &&
        this.state.x + this.width > platform.x &&
        this.state.y < platform.y + platform.height &&
        this.state.y + this.height > platform.y
      ) {
        // Simple AABB collision response
        if (this.state.vy > 0 && this.state.y + this.height - this.state.vy <= platform.y) {
          this.state.y = platform.y - this.height;
          this.state.vy = 0;
          this.isGrounded = true;
          this.canDoubleJump = true;
          
          if (!wasGrounded) {
            this.scaleX = 1.4;
            this.scaleY = 0.6;
            this.onLand?.();
          }
          
          if (platform.type === "hazard") {
            this.die();
          }
          if (platform.type === "goal") {
            this.reachedGoal = true;
          }
        } else if (this.state.vy < 0 && this.state.y - this.state.vy >= platform.y + platform.height) {
          this.state.y = platform.y + platform.height;
          this.state.vy = 0;
        } else if (this.state.vx > 0 && this.state.x + this.width - this.state.vx <= platform.x) {
          this.state.x = platform.x - this.width;
          this.state.vx = 0;
        } else if (this.state.vx < 0 && this.state.x - this.state.vx >= platform.x + platform.width) {
          this.state.x = platform.x + platform.width;
          this.state.vx = 0;
        }
      }
    }

    // Ease scale back to 1
    this.scaleX += (1 - this.scaleX) * 0.2;
    this.scaleY += (1 - this.scaleY) * 0.2;

    // Update emote timer
    if (this.emoteTimer > 0) {
      this.emoteTimer--;
      if (this.emoteTimer === 0) this.activeEmote = null;
    }

    // Update expression based on state
    if (this.reachedGoal) {
      this.state.expression = "happy";
    } else if (Math.abs(this.state.vx) > 4) {
      this.state.expression = "determined";
    } else if (Math.abs(this.state.vy) < -2) {
      this.state.expression = "surprised";
    } else {
      this.state.expression = "neutral";
    }

    // Boundaries
    if (this.state.x < 0) this.state.x = 0;
    if (this.state.x > MAP_WIDTH - this.width) this.state.x = MAP_WIDTH - this.width;
    if (this.state.y > MAP_HEIGHT) this.die();
  }

  die() {
    if (this.isDead) return;
    this.isDead = true;
    this.onDeath?.();
    setTimeout(() => {
      this.reset();
      this.isDead = false;
    }, 500);
  }

  reset() {
    this.state.x = 100;
    this.state.y = 100;
    this.state.vx = 0;
    this.state.vy = 0;
    this.scaleX = 1;
    this.scaleY = 1;
  }

  jump() {
    if (this.isDead) return;
    if (this.isGrounded) {
      this.state.vy = JUMP_FORCE;
      this.isGrounded = false;
      this.scaleX = 0.6;
      this.scaleY = 1.4;
      this.onJump?.();
    } else if (this.canDoubleJump) {
      this.state.vy = JUMP_FORCE;
      this.canDoubleJump = false;
      this.scaleX = 0.6;
      this.scaleY = 1.4;
      this.onDoubleJump?.();
    }
  }

  move(dir: number) {
    if (this.isDead) return;
    this.state.vx = dir * SPEED;
    if (dir !== 0) this.state.facing = dir;
  }

  draw(ctx: CanvasRenderingContext2D, offsetX: number, offsetY: number = 0) {
    if (this.isDead) {
      // Draw a "glitch" or "explosion" effect
      const drawX = this.state.x - offsetX + this.width / 2;
      const drawY = this.state.y - offsetY + this.height / 2;
      ctx.save();
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#ff0055";
      ctx.fillStyle = "#ff0055";
      ctx.beginPath();
      ctx.arc(drawX, drawY, Math.random() * 20 + 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    const drawX = this.state.x - offsetX;
    const drawY = this.state.y - offsetY;

    // Neon glow
    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = this.state.color;
    ctx.fillStyle = this.state.color;
    
    // Apply squash and stretch
    ctx.translate(drawX + this.width / 2, drawY + this.height);
    ctx.scale(this.scaleX, this.scaleY);
    ctx.translate(-(drawX + this.width / 2), -(drawY + this.height));
    
    // Body
    if (this.state.shape === "circle") {
      ctx.beginPath();
      ctx.arc(drawX + this.width / 2, drawY + this.height / 2, this.width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.state.shape === "triangle") {
      ctx.beginPath();
      ctx.moveTo(drawX + this.width / 2, drawY);
      ctx.lineTo(drawX, drawY + this.height);
      ctx.lineTo(drawX + this.width, drawY + this.height);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(drawX, drawY, this.width, this.height);
    }
    
    // Eyes
    ctx.fillStyle = "white";
    const eyeOffset = this.state.facing === 1 ? 18 : 2;
    const eyeY = this.state.shape === "triangle" ? drawY + 25 : drawY + 10;
    
    if (this.state.expression === "surprised") {
      ctx.beginPath();
      ctx.arc(drawX + eyeOffset + 5, eyeY + 2, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.state.expression === "determined") {
      ctx.fillRect(drawX + eyeOffset, eyeY, 8, 3);
    } else {
      ctx.fillRect(drawX + eyeOffset, eyeY, 6, 6);
    }

    // Mouth
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const mouthY = eyeY + 15;
    if (this.state.expression === "happy") {
      ctx.arc(drawX + eyeOffset + 3, mouthY, 4, 0, Math.PI);
    } else if (this.state.expression === "surprised") {
      ctx.arc(drawX + eyeOffset + 3, mouthY + 5, 3, 0, Math.PI * 2);
    } else {
      ctx.moveTo(drawX + eyeOffset, mouthY + 5);
      ctx.lineTo(drawX + eyeOffset + 8, mouthY + 5);
    }
    ctx.stroke();
    
    ctx.restore();

    // Name tag (outside squash/stretch)
    ctx.save();
    ctx.fillStyle = "white";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.state.name, drawX + this.width / 2, drawY - 10);
    
    // Draw emote
    if (this.activeEmote) {
      ctx.font = "24px sans-serif";
      ctx.fillText(this.activeEmote, drawX + this.width / 2, drawY - 35);
    }
    ctx.restore();
  }
}
