import React, { Component, useEffect, useRef, useState } from "react";
import { GamePlayer } from "./game/Player";
import { Particle } from "./game/Particle";
import { LEVELS, MAP_WIDTH, MAP_HEIGHT } from "./game/constants";
import { MoveLeft, MoveRight, ArrowUp, Map as MapIcon, Play, Info, Trophy, Github, Twitter, X, CheckCircle2, Circle, User, Instagram, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, auth, signInWithGoogle, signInAnonymously } from "./lib/firebase";
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  serverTimestamp,
  getDoc,
  getDocs,
  getDocFromServer,
  runTransaction,
  writeBatch
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

type GameState = "landing" | "playing";

class ErrorBoundary extends Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }
  render() {
    if ((this as any).state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-black text-white p-6 text-center">
          <h1 className="text-2xl font-bold text-red-500 mb-4">Something went wrong</h1>
          <p className="text-gray-400 mb-6 max-w-md">The application encountered an unexpected error. Please try refreshing the page.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-cyan-500 rounded-full font-bold hover:bg-cyan-400 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

const LobbyBackground = () => {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#050505] -z-10">
      <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 via-transparent to-pink-500/5" />
      <div className="absolute inset-0 backdrop-blur-[100px]" />
      
      {/* Parallax Particles */}
      {[...Array(20)].map((_, i) => (
        <motion.div
          key={i}
          initial={{ 
            x: Math.random() * window.innerWidth, 
            y: Math.random() * window.innerHeight,
            opacity: Math.random() * 0.5
          }}
          animate={{ 
            y: [null, Math.random() * -500],
            opacity: [null, 0]
          }}
          transition={{ 
            duration: Math.random() * 10 + 10, 
            repeat: Infinity, 
            ease: "linear" 
          }}
          className="absolute w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_10px_#22d3ee]"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
        />
      ))}
      
      {/* Moving Neon Lines */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-cyan-500 to-transparent animate-pulse" />
        <div className="absolute top-3/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-pink-500 to-transparent animate-pulse delay-700" />
      </div>
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <GameApp />
    </ErrorBoundary>
  );
}

function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [user, setUser] = useState<any>(null);
  const [gameState, setGameState] = useState<GameState>("landing");
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showCredits, setShowCredits] = useState(false);
  const [roomId, setRoomId] = useState("lobby");
  const [tempRoomId, setTempRoomId] = useState("");
  const [currentLevel, setCurrentLevel] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [isCountingDown, setIsCountingDown] = useState(false);
  const [playerName, setPlayerName] = useState("Meow Singh");
  const [playerColor, setPlayerColor] = useState("#00ffcc");
  const [localPlayer, setLocalPlayer] = useState<GamePlayer>(() => {
    return new GamePlayer("local", 100, 100, "#00ffcc", "Meow Singh", true);
  });
  const [remotePlayers, setRemotePlayers] = useState<Map<string, GamePlayer>>(new Map());
  const [playerReadyStates, setPlayerReadyStates] = useState<Record<string, boolean>>({});
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [isPortrait, setIsPortrait] = useState(false);
  const isPortraitRef = useRef<boolean>(false);
  const starsRef = useRef<{x: number, y: number, size: number, opacity: number}[]>([]);

  // Initialize stars once - reduced for clarity
  useEffect(() => {
    const stars = [];
    for (let i = 0; i < 100; i++) {
      stars.push({
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
        size: Math.random() * 1.5 + 0.5,
        opacity: Math.random() * 0.3 + 0.1
      });
    }
    starsRef.current = stars;
  }, []);
  const isCompletingLevelRef = useRef<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
    const errInfo: FirestoreErrorInfo = {
      error: error instanceof Error ? error.message : String(error),
      authInfo: {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        emailVerified: auth.currentUser?.emailVerified,
        isAnonymous: auth.currentUser?.isAnonymous,
        tenantId: auth.currentUser?.tenantId,
        providerInfo: auth.currentUser?.providerData.map(provider => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
      },
      operationType,
      path
    }
    console.error('Firestore Error: ', JSON.stringify(errInfo));
    setError(`Firestore Error: ${errInfo.error}`);
  };
  
  const keys = useRef<Record<string, boolean>>({});
  const mobileDir = useRef<number>(0);
  const requestRef = useRef<number>(0);
  const localPlayerRef = useRef<GamePlayer>(localPlayer);
  const remotePlayersRef = useRef<Map<string, GamePlayer>>(new Map());
  const showMiniMapRef = useRef<boolean>(showMiniMap);
  const gameStateRef = useRef<GameState>(gameState);
  const currentLevelRef = useRef<number>(currentLevel);
  const isGameStartedRef = useRef<boolean>(isGameStarted);
  const isCountingDownRef = useRef<boolean>(false);
  const particlesRef = useRef<Particle[]>([]);
  const screenShakeRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);
  const roomIdRef = useRef<string>(roomId);
  const userRef = useRef<any>(user);
  const cameraRef = useRef({ x: 0, y: 0 });
  const cameraInitializedRef = useRef(false);

  // Sync state to refs for the game loop
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { isGameStartedRef.current = isGameStarted; }, [isGameStarted]);
  useEffect(() => { isCountingDownRef.current = isCountingDown; }, [isCountingDown]);
  useEffect(() => { currentLevelRef.current = currentLevel; }, [currentLevel]);
  useEffect(() => { showMiniMapRef.current = showMiniMap; }, [showMiniMap]);
  useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => {
    localPlayerRef.current = localPlayer;
  }, [localPlayer]);

  const [levelStartTime, setLevelStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [playerShape, setPlayerShape] = useState<"square" | "circle" | "triangle">("square");

  // Connection test
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setPlayerName(u.displayName || "Meow Singh");
      }
    });
    return () => unsubscribe();
  }, []);

  // Game sync listener
  useEffect(() => {
    if (gameState !== "playing" || !user) return;

    // 1. Listen to room metadata
    const roomRef = doc(db, "rooms", roomId);
    const unsubscribeRoom = onSnapshot(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.currentLevel !== undefined && data.currentLevel !== currentLevelRef.current) {
          setCurrentLevel(data.currentLevel);
          setIsGameStarted(false);
          setIsReady(false);
          localPlayerRef.current?.reset();
          setLevelStartTime(null);
          setElapsedTime(0);
          isCompletingLevelRef.current = false;
          cameraInitializedRef.current = false;
        }
        if (data.countdown !== undefined) {
          setCountdown(data.countdown);
        } else {
          setCountdown(null);
        }
        if (data.isCountingDown !== undefined) {
          setIsCountingDown(data.isCountingDown);
        }
        if (data.isGameStarted && !isGameStartedRef.current) {
          setIsGameStarted(true);
          setLevelStartTime(Date.now());
          setCountdown(null);
        }
      } else {
        // Initialize room if it doesn't exist
        setDoc(roomRef, { currentLevel: 0, isCountingDown: false, isGameStarted: false })
          .catch(e => handleFirestoreError(e, OperationType.WRITE, `rooms/${roomId}`));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `rooms/${roomId}`);
    });

    // 2. Listen to players
    const playersRef = collection(db, "rooms", roomId, "players");
    const unsubscribePlayers = onSnapshot(playersRef, (snapshot) => {
      const remotes = new Map<string, GamePlayer>(remotePlayersRef.current);
      const readyStates: Record<string, boolean> = {};
      const activeThreshold = Date.now() - 15000; // 15 seconds
      
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const id = change.doc.id;
        
        // Filter out inactive players from the map
        const lastUpdate = data.lastUpdate?.toMillis?.() || 0;
        const isActive = lastUpdate > activeThreshold || !data.lastUpdate; // Allow initial join

        if (id === user.uid) {
          setIsReady(data.ready);
        } else {
          if ((change.type === "added" || change.type === "modified") && isActive) {
            let p = remotes.get(id);
            if (!p) {
              p = new GamePlayer(id, data.x, data.y, data.color, data.name, false, data.shape || "square");
              remotes.set(id, p);
            }
            if (p) {
              p.state.x = data.x;
              p.state.y = data.y;
              p.state.vx = data.vx || 0;
              p.state.vy = data.vy || 0;
              p.state.facing = data.facing || 1;
              p.state.shape = data.shape || "square";
              p.state.expression = data.expression || "neutral";
              if (data.emote) {
                p.setEmote(data.emote);
              }
            }
            readyStates[id] = data.ready;
          } else if (change.type === "removed" || !isActive) {
            remotes.delete(id);
            delete readyStates[id];
          }
        }
      });

      // Update all ready states and filter inactive players
      const activePlayers: any[] = [];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const lastUpdate = data.lastUpdate?.toMillis?.() || 0;
        const isActive = lastUpdate > activeThreshold || !data.lastUpdate;
        
        if (isActive) {
          activePlayers.push(data);
          if (doc.id === user.uid) {
            setIsReady(data.ready);
          } else {
            readyStates[doc.id] = data.ready;
          }
        } else if (doc.id !== user.uid) {
          // If inactive and not local, ensure it's removed from local state
          remotes.delete(doc.id);
          delete readyStates[doc.id];
        }
      });

      setRemotePlayers(remotes);
      remotePlayersRef.current = remotes;
      setPlayerReadyStates(readyStates);

      // Check for countdown trigger (if all active players are ready)
      const allReady = activePlayers.length > 0 && activePlayers.every(p => p.ready);
      
      if (allReady && !isGameStartedRef.current && !isCountingDownRef.current) {
        const activePlayerIds = activePlayers.map(p => p.id);
        checkAndStartCountdown(activePlayerIds);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `rooms/${roomId}/players`);
    });

    // 3. Cleanup on exit
    const handleBeforeUnload = () => {
      deleteDoc(doc(db, "rooms", roomId, "players", user.uid));
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      unsubscribeRoom();
      unsubscribePlayers();
      window.removeEventListener("beforeunload", handleBeforeUnload);
      handleBeforeUnload();
    };
  }, [gameState, user, roomId]);

  const checkAndStartCountdown = async (activePlayerIds: string[]) => {
    if (activePlayerIds.length === 0 || isCountingDownRef.current) return;
    const roomRef = doc(db, "rooms", roomId);
    try {
      const roomSnap = await getDoc(roomRef);
      if (!roomSnap.exists()) return;
      
      const data = roomSnap.data();
      if (!data.isCountingDown && !data.isGameStarted) {
        // Only the "host" (lowest UID among ACTIVE players) initiates the countdown
        const sortedIds = [...activePlayerIds].sort();
        const hostId = sortedIds[0];
        
        if (hostId === user.uid) {
          await updateDoc(roomRef, { isCountingDown: true, countdown: 3 });
          
          let count = 3;
          const interval = setInterval(async () => {
            count--;
            try {
              if (count < 0) {
                clearInterval(interval);
                await updateDoc(roomRef, { 
                  isCountingDown: false, 
                  isGameStarted: true, 
                  countdown: null,
                  levelStartTime: Date.now() 
                });
              } else {
                await updateDoc(roomRef, { countdown: count });
              }
            } catch (e) {
              clearInterval(interval);
              console.error("Error updating countdown", e);
            }
          }, 1000);
        }
      }
    } catch (e) {
      console.error("Countdown initiation failed", e);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (gameStateRef.current === "playing" && isGameStartedRef.current) {
        if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
          localPlayerRef.current?.jump();
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const createParticles = (x: number, y: number, color: string, count: number = 10) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push(new Particle(x, y, color));
    }
  };

  useEffect(() => {
    const p = localPlayerRef.current;
    if (p) {
      p.onJump = () => {
        createParticles(p.state.x + p.width / 2, p.state.y + p.height, p.state.color, 5);
      };
      p.onDoubleJump = () => {
        screenShakeRef.current = 5;
        createParticles(p.state.x + p.width / 2, p.state.y + p.height / 2, "#ffffff", 15);
      };
      p.onLand = () => {
        createParticles(p.state.x + p.width / 2, p.state.y + p.height, p.state.color, 8);
      };
      p.onDeath = () => {
        screenShakeRef.current = 15;
        createParticles(p.state.x + p.width / 2, p.state.y + p.height / 2, "#ff0055", 20);
      };
    }
  }, [localPlayer]);

  useEffect(() => {
    let interval: any;
    if (isGameStarted && levelStartTime) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - levelStartTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isGameStarted, levelStartTime]);

  const update = () => {
    if (gameStateRef.current !== "playing") return;
    
    const p = localPlayerRef.current;
    const currentRoomId = roomIdRef.current;
    const currentUser = userRef.current;

    if (!currentUser || !currentRoomId) return;

    const now = Date.now();

    // If game is started, handle physics and movement
    if (isGameStartedRef.current && p) {
      let dir = mobileDir.current;
      if (keys.current["ArrowLeft"] || keys.current["KeyA"]) dir -= 1;
      if (keys.current["ArrowRight"] || keys.current["KeyD"]) dir += 1;
      
      const currentPlatforms = LEVELS[currentLevelRef.current] || [];
      p.move(dir);
      p.update(currentPlatforms);

      if (p.reachedGoal && !isCompletingLevelRef.current) {
        isCompletingLevelRef.current = true;
        handleLevelComplete();
        createParticles(p.state.x + p.width / 2, p.state.y + p.height / 2, "#a855f7", 30);
      }

      // Throttled movement update (also acts as heartbeat)
      if (now - lastUpdateRef.current > 50) {
        lastUpdateRef.current = now;
        updateDoc(doc(db, "rooms", currentRoomId, "players", currentUser.uid), {
          x: p.state.x,
          y: p.state.y,
          vx: p.state.vx,
          vy: p.state.vy,
          facing: p.state.facing,
          shape: p.state.shape,
          expression: p.state.expression,
          lastUpdate: serverTimestamp()
        }).catch(e => console.error("Throttled update failed", e));
      }
    } else {
      // Heartbeat for players in lobby (not yet started)
      if (now - lastUpdateRef.current > 5000) {
        lastUpdateRef.current = now;
        updateDoc(doc(db, "rooms", currentRoomId, "players", currentUser.uid), {
          lastUpdate: serverTimestamp()
        }).catch(e => console.error("Heartbeat update failed", e));
      }
    }

    // Update particles
    particlesRef.current = particlesRef.current.filter(p => p.life > 0);
    particlesRef.current.forEach(p => p.update());

    // Update screen shake
    if (screenShakeRef.current > 0) {
      screenShakeRef.current = Math.max(0, screenShakeRef.current - 1);
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const p = localPlayerRef.current;
    if (!p) return;

    // Ensure sharp rendering
    ctx.imageSmoothingEnabled = false;

    const dpr = window.devicePixelRatio || 1;
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const logicalWidth = canvasWidth / dpr;
    const logicalHeight = canvasHeight / dpr;

    // Clear canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Responsive Scale: Zoom out more to see more of the map
    const minVisibleWidth = 2000;
    const minVisibleHeight = 1200;
    
    // Calculate raw scale
    const rawScale = Math.min(logicalWidth / minVisibleWidth, logicalHeight / minVisibleHeight);
    
    // To ensure sharpness, the total scale (cameraScale * dpr) should ideally be an integer.
    // We'll round cameraScale to the nearest multiple of 1/dpr.
    const cameraScale = Math.max(0.1, Math.round(rawScale * dpr) / dpr);
    
    // Viewport dimensions in game world units
    const viewWidth = logicalWidth / cameraScale;
    const viewHeight = logicalHeight / cameraScale;

    // Camera Logic
    // Horizontal: Smoothly follow player with a slight offset to see ahead
    const targetX = p.state.x - viewWidth * 0.3;
    
    // Vertical: Smoothly center on player
    const targetY = p.state.y - viewHeight * 0.5;
    
    // Smoothly interpolate position to avoid jitter/judder
    const lerpSpeed = 0.15;
    
    if (!cameraInitializedRef.current) {
      cameraRef.current.x = targetX;
      cameraRef.current.y = targetY;
      cameraInitializedRef.current = true;
    } else {
      cameraRef.current.x += (targetX - cameraRef.current.x) * lerpSpeed;
      cameraRef.current.y += (targetY - cameraRef.current.y) * lerpSpeed;
    }
    
    // Clamp camera to map boundaries and round for sharpness
    const offsetX = Math.round(Math.max(0, Math.min(cameraRef.current.x, MAP_WIDTH - viewWidth)));
    const offsetY = Math.round(Math.max(0, Math.min(cameraRef.current.y, MAP_HEIGHT - viewHeight)));

    // Start drawing world
    ctx.save();
    ctx.scale(dpr * cameraScale, dpr * cameraScale);
    ctx.translate(-offsetX, -offsetY);
    
    // Re-ensure smoothing is off after scale
    ctx.imageSmoothingEnabled = false;
    
    if (screenShakeRef.current > 0) {
      const dx = (Math.random() - 0.5) * screenShakeRef.current;
      const dy = (Math.random() - 0.5) * screenShakeRef.current;
      ctx.translate(dx, dy);
    }

    // Parallax Background (Stars & Grid)
    ctx.fillStyle = "#020205";
    ctx.fillRect(offsetX, offsetY, viewWidth, viewHeight);
    
    // Draw Stars with parallax
    ctx.save();
    starsRef.current.forEach(star => {
      // Parallax factor: deeper stars move slower
      const px = star.x - offsetX * 0.2;
      const py = star.y - offsetY * 0.2;
      
      // Wrap around for infinite feel
      const wrapX = ((px % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
      const wrapY = ((py % MAP_HEIGHT) + MAP_HEIGHT) % MAP_HEIGHT;
      
      if (wrapX >= offsetX && wrapX <= offsetX + viewWidth && wrapY >= offsetY && wrapY <= offsetY + viewHeight) {
        ctx.fillStyle = `rgba(255, 255, 255, ${star.opacity})`;
        ctx.beginPath();
        ctx.arc(wrapX, wrapY, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
    
    ctx.strokeStyle = "rgba(0, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    const gridSize = 200;
    const startX = Math.floor(offsetX / gridSize) * gridSize;
    const startY = Math.floor(offsetY / gridSize) * gridSize;
    
    for (let x = startX; x < offsetX + viewWidth; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, offsetY);
      ctx.lineTo(x, offsetY + viewHeight);
      ctx.stroke();
    }
    for (let y = startY; y < offsetY + viewHeight; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX, y);
      ctx.lineTo(offsetX + viewWidth, y);
      ctx.stroke();
    }

    // Draw platforms
    const currentPlatforms = LEVELS[currentLevelRef.current] || [];
    const time = Date.now() * 0.001;
    
    currentPlatforms.forEach((plat) => {
      ctx.save();
      
      let color = "#00ffcc";
      let glowColor = "rgba(0, 255, 204, 0.4)";
      if (plat.type === "hazard") {
        color = "#ff0055";
        glowColor = "rgba(255, 0, 85, 0.4)";
      } else if (plat.type === "goal") {
        color = "#a855f7";
        glowColor = "rgba(168, 85, 247, 0.4)";
      }

      // Removed shadowBlur for maximum clarity
      ctx.shadowBlur = 0;
      
      // Gradient fill
      const grad = ctx.createLinearGradient(plat.x, plat.y, plat.x, plat.y + plat.height);
      grad.addColorStop(0, color);
      grad.addColorStop(1, glowColor);
      ctx.fillStyle = grad;
      
      ctx.fillRect(plat.x, plat.y, plat.width, plat.height);
      
      // Inner highlight
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(plat.x + 2, plat.y + 2, plat.width - 4, plat.height - 4);

      // Swaying Foliage (Neon Grass)
      if (plat.type !== "hazard") {
        const grassCount = Math.floor(plat.width / 15);
        for (let i = 0; i < grassCount; i++) {
          const gx = plat.x + (i * 15) + 5;
          const gy = plat.y;
          const sway = Math.sin(time * 2 + i) * 5;
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.quadraticCurveTo(gx + sway, gy - 10, gx + sway * 1.5, gy - 20);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      
      ctx.restore();
    });

    // Animated Water (Glowing Liquid at the bottom)
    const waterLevel = MAP_HEIGHT - 100;
    if (offsetY + viewHeight > waterLevel) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 255, 255, 0.1)";
      ctx.beginPath();
      ctx.moveTo(offsetX, waterLevel);
      for (let wx = offsetX; wx <= offsetX + viewWidth; wx += 20) {
        const wy = waterLevel + Math.sin(time * 3 + wx * 0.01) * 10;
        ctx.lineTo(wx, wy);
      }
      ctx.lineTo(offsetX + viewWidth, MAP_HEIGHT);
      ctx.lineTo(offsetX, MAP_HEIGHT);
      ctx.closePath();
      ctx.fill();
      
      // Surface glow
      ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    // Draw remote players
    remotePlayersRef.current.forEach((rp) => {
      rp.draw(ctx, 0, 0); // Offset is handled by ctx.translate
    });

    // Draw local player
    p.draw(ctx, 0, 0);

    // Draw particles
    particlesRef.current.forEach(p => p.draw(ctx, 0, 0));

    ctx.restore(); // End world drawing

    // Removed vignette and scanlines for maximum clarity

    // Draw UI (Mini Map) in logical pixels
    if (showMiniMapRef.current) {
      const mw = isPortraitRef.current ? 80 : 120;
      const mh = isPortraitRef.current ? 40 : 60;
      const mx = logicalWidth - mw - 15;
      const my = 15;
      
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
      ctx.strokeStyle = "rgba(0, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeRect(mx, my, mw, mh);
      
      const scaleX = mw / MAP_WIDTH;
      const scaleY = mh / MAP_HEIGHT;
      
      // Draw platforms on mini map
      ctx.fillStyle = "rgba(0, 204, 255, 0.6)";
      currentPlatforms.forEach(plat => {
        ctx.fillRect(mx + plat.x * scaleX, my + plat.y * scaleY, Math.max(1, plat.width * scaleX), Math.max(1, plat.height * scaleY));
      });
      
      // Local player on mini map
      ctx.fillStyle = p.state.color;
      ctx.fillRect(mx + p.state.x * scaleX - 1.5, my + p.state.y * scaleY - 1.5, 3, 3);
      
      // Remote players on mini map
      remotePlayersRef.current.forEach(rp => {
        ctx.fillStyle = rp.state.color;
        ctx.fillRect(mx + rp.state.x * scaleX - 1.5, my + rp.state.y * scaleY - 1.5, 3, 3);
      });
      
      ctx.restore();
    }
  };

  const loop = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        update();
        draw(ctx);
      }
    }
    requestRef.current = requestAnimationFrame(loop);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (canvasRef.current) {
          const { width, height } = entry.contentRect;
          const portrait = height > width;
          isPortraitRef.current = portrait;
          setIsPortrait(portrait);
          const dpr = window.devicePixelRatio || 1;
          canvasRef.current.width = width * dpr;
          canvasRef.current.height = height * dpr;
          canvasRef.current.style.width = `${width}px`;
          canvasRef.current.style.height = `${height}px`;
          // We handle scaling inside the draw function for better control
        }
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Mobile controls
  const handleJump = () => {
    if (isGameStarted) localPlayer?.jump();
  };
  const handleMove = (dir: number) => {
    mobileDir.current = dir;
  };

  const handleStartPlaying = async () => {
    let currentUser = auth.currentUser;
    if (!currentUser) {
      try {
        currentUser = await signInAnonymously();
      } catch (e: any) {
        console.error("Guest sign in failed", e);
        if (e.code === 'auth/operation-not-allowed') {
          setError("Guest login is not enabled in the Firebase Console.");
        } else {
          setError("Failed to start as guest: " + (e.message || "Unknown error"));
        }
        return;
      }
    }

    if (!currentUser) {
      setError("Authentication failed. Please try again.");
      return;
    }

    const finalRoom = tempRoomId.trim() || "lobby";
    setRoomId(finalRoom);
    
    try {
      // Initialize player in Firestore
      const playerRef = doc(db, "rooms", finalRoom, "players", currentUser.uid);
      await setDoc(playerRef, {
        id: currentUser.uid,
        name: playerName,
        color: playerColor,
        shape: playerShape,
        x: 100,
        y: 2700,
        vx: 0,
        vy: 0,
        ready: false,
        expression: "neutral",
        facing: 1,
        lastUpdate: serverTimestamp()
      });

      localPlayer.state.id = currentUser.uid;
      localPlayer.state.name = playerName;
      localPlayer.state.color = playerColor;
      localPlayer.state.shape = playerShape;
      
      setGameState("playing");
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `rooms/${finalRoom}/players/${currentUser.uid}`);
    }
  };

  const sendEmote = async (emote: string) => {
    if (user) {
      try {
        await updateDoc(doc(db, "rooms", roomId, "players", user.uid), { emote });
        // Reset emote after a short delay so it can be triggered again
        setTimeout(() => {
          updateDoc(doc(db, "rooms", roomId, "players", user.uid), { emote: null })
            .catch(e => console.error("Emote reset failed", e));
        }, 100);
      } catch (e) {
        console.error("Emote update failed", e);
      }
    }
  };

  const toggleReady = async () => {
    if (user) {
      try {
        const nextReady = !isReady;
        setIsReady(nextReady);
        await updateDoc(doc(db, "rooms", roomId, "players", user.uid), { ready: nextReady });
      } catch (e) {
        handleFirestoreError(e, OperationType.UPDATE, `rooms/${roomId}/players/${user.uid}`);
      }
    }
  };

  const handleLevelComplete = async () => {
    const roomRef = doc(db, "rooms", roomId);
    try {
      await runTransaction(db, async (transaction) => {
        const roomSnap = await transaction.get(roomRef);
        if (!roomSnap.exists()) return;
        
        const data = roomSnap.data();
        const nextLevel = data.currentLevel + 1;
        
        if (nextLevel < LEVELS.length) {
          transaction.update(roomRef, { 
            currentLevel: nextLevel, 
            isGameStarted: false,
            isCountingDown: false
          });
          
          // Reset local player goal state immediately
          if (localPlayerRef.current) {
            localPlayerRef.current.reachedGoal = false;
          }
          isCompletingLevelRef.current = false;
        } else {
          setError("Congratulations! You've completed all levels!");
          transaction.update(roomRef, { currentLevel: 0, isGameStarted: false });
          setGameState("landing");
          isCompletingLevelRef.current = false;
        }
      });

      // Reset all players ready state outside transaction for simplicity (or could be inside)
      const playersSnap = await getDocs(collection(db, "rooms", roomId, "players"));
      const batch = writeBatch(db);
      playersSnap.docs.forEach((d) => {
        batch.update(d.ref, { ready: false, x: 100, y: 2700 });
      });
      await batch.commit();
      
    } catch (e) {
      isCompletingLevelRef.current = false;
      handleFirestoreError(e, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  const resetRoom = async () => {
    const roomRef = doc(db, "rooms", roomId);
    try {
      await updateDoc(roomRef, { 
        isGameStarted: false, 
        isCountingDown: false, 
        countdown: null,
        currentLevel: 0 
      });
      const playersSnap = await getDocs(collection(db, "rooms", roomId, "players"));
      const batch = writeBatch(db);
      playersSnap.docs.forEach(d => batch.update(d.ref, { ready: false, x: 100, y: 2700 }));
      await batch.commit();
      
      // Reset local state
      setIsReady(false);
      cameraInitializedRef.current = false;
      if (localPlayerRef.current) {
        localPlayerRef.current.reset();
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#050505] font-sans text-white">
      {/* Error Display */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-red-500/90 backdrop-blur-md px-6 py-3 rounded-full shadow-lg flex items-center gap-3 border border-red-400"
          >
            <span className="text-sm font-medium">{error}</span>
            <button 
              onClick={() => setError(null)}
              className="p-1 hover:bg-white/20 rounded-full transition-colors"
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {gameState === "landing" ? (
          <motion.div 
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 md:p-12 overflow-hidden font-sans"
          >
            <LobbyBackground />

            {/* Header */}
            <div className="absolute top-12 left-0 right-0 flex flex-col items-center pointer-events-none">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="mb-2 text-cyan-400 font-black uppercase tracking-[0.4em] text-[10px] drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]"
              >
                gopu and govind presents
              </motion.div>
              <motion.h1 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-6xl md:text-8xl font-black italic tracking-tighter text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
              >
                MEOW <span className="text-cyan-400">ARENA</span>
              </motion.h1>
              <p className="text-[10px] font-black uppercase tracking-[0.5em] text-white/20 mt-2">High-Speed Neon Parkour</p>
            </div>

            <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center mt-20 relative z-10">
              
              {/* Left Side: Active Rooms */}
              <motion.div 
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-3 flex flex-col gap-4 h-[500px]"
              >
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Active Worlds</h3>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                </div>
                <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                  {[
                    { name: "Cyber Arena", players: "12/20", ping: "24ms", color: "text-cyan-400" },
                    { name: "Neon Heights", players: "5/20", ping: "42ms", color: "text-pink-400" },
                    { name: "Void Runner", players: "18/20", ping: "12ms", color: "text-purple-400" },
                    { name: "Grid Master", players: "2/20", ping: "68ms", color: "text-yellow-400" },
                  ].map((room, i) => (
                    <motion.button
                      key={i}
                      whileHover={{ x: 5, backgroundColor: "rgba(255,255,255,0.05)" }}
                      onClick={() => {
                        setTempRoomId(room.name.toLowerCase().replace(" ", "-"));
                        handleStartPlaying();
                      }}
                      className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-left transition-all group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className={`text-sm font-black uppercase tracking-tight ${room.color}`}>{room.name}</span>
                        <span className="text-[10px] font-bold text-white/20">{room.ping}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{room.players} Players</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={14} className="text-white/40" />
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Center: Create Private Lobby */}
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="lg:col-span-6 flex flex-col items-center justify-center gap-8"
              >
                <div className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-600 rounded-3xl blur opacity-20 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
                  <button 
                    onClick={() => {
                      const id = Math.random().toString(36).substring(7);
                      setTempRoomId(id);
                      handleStartPlaying();
                    }}
                    className="relative px-12 py-8 bg-black border-2 border-yellow-500/50 rounded-3xl flex flex-col items-center gap-2 transition-all hover:border-yellow-400 group"
                  >
                    <Trophy className="text-yellow-500 group-hover:scale-110 transition-transform" size={48} />
                    <span className="text-2xl font-black uppercase tracking-tighter text-white">Create Private Lobby</span>
                    <span className="text-[10px] font-bold text-yellow-500/50 uppercase tracking-[0.2em]">Gold Tier Session</span>
                  </button>
                </div>

                <div className="flex flex-col items-center gap-4 w-full max-w-xs">
                  <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <div className="flex items-center gap-3 w-full">
                    <input 
                      type="text" 
                      value={tempRoomId}
                      onChange={(e) => setTempRoomId(e.target.value)}
                      placeholder="Enter Room ID..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-cyan-500 transition-all text-center font-bold"
                    />
                  </div>
                </div>
              </motion.div>

              {/* Right Side: Character Preview */}
              <motion.div 
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="lg:col-span-3 flex flex-col gap-6 items-center"
              >
                <div className="w-full p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md flex flex-col items-center gap-6">
                  <h3 className="text-xs font-black uppercase tracking-widest text-white/40 self-start">Character Profile</h3>
                  
                  {/* Preview Box */}
                  <div className="relative w-40 h-40 bg-black/40 rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-cyan-500/10" />
                    <motion.div 
                      animate={{ 
                        y: [0, -10, 0],
                        rotate: [0, 2, -2, 0]
                      }}
                      transition={{ duration: 4, repeat: Infinity }}
                      className="relative z-10"
                    >
                      <div 
                        className={`w-16 h-16 border-4 border-white shadow-[0_0_20px_rgba(255,255,255,0.5)] ${playerShape === 'circle' ? 'rounded-full' : playerShape === 'triangle' ? '' : 'rounded-lg'}`}
                        style={{ 
                          backgroundColor: playerColor,
                          clipPath: playerShape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none'
                        }}
                      />
                    </motion.div>
                    <div className="absolute bottom-2 left-0 right-0 text-center">
                      <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{playerName}</span>
                    </div>
                  </div>

                  <div className="w-full space-y-4">
                    <input 
                      type="text" 
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2 text-xs text-white text-center font-bold focus:border-cyan-500 outline-none"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {(["square", "circle", "triangle"] as const).map(shape => (
                        <button
                          key={shape}
                          onClick={() => setPlayerShape(shape)}
                          className={`py-2 rounded-lg border transition-all flex items-center justify-center ${playerShape === shape ? 'border-cyan-500 bg-cyan-500/20' : 'border-white/10 bg-white/5 opacity-50 hover:opacity-100'}`}
                        >
                          <div className={`w-3 h-3 border-2 border-white ${shape === 'circle' ? 'rounded-full' : shape === 'triangle' ? '' : 'rounded-sm'}`} 
                               style={{ clipPath: shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none' }}
                          />
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-center gap-2">
                      {["#00ffcc", "#ff0055", "#a855f7", "#fbbf24", "#3b82f6"].map(color => (
                        <button
                          key={color}
                          onClick={() => setPlayerColor(color)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${playerColor === color ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <button 
                      onClick={() => setShowHowToPlay(true)}
                      className="w-full py-3 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-[10px] font-black uppercase tracking-widest text-cyan-400 hover:bg-cyan-500 hover:text-white transition-all"
                    >
                      Customize Skin
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 w-full">
                  <motion.button 
                    onClick={() => setShowCredits(true)}
                    animate={{ 
                      boxShadow: [
                        "0 0 10px rgba(255, 0, 255, 0.3)",
                        "0 0 10px rgba(0, 255, 255, 0.3)",
                        "0 0 10px rgba(255, 255, 0, 0.3)",
                        "0 0 10px rgba(255, 0, 255, 0.3)"
                      ],
                      borderColor: [
                        "rgba(255, 0, 255, 0.5)",
                        "rgba(0, 255, 255, 0.5)",
                        "rgba(255, 255, 0, 0.5)",
                        "rgba(255, 0, 255, 0.5)"
                      ],
                      color: [
                        "rgba(255, 0, 255, 1)",
                        "rgba(0, 255, 255, 1)",
                        "rgba(255, 255, 0, 1)",
                        "rgba(255, 0, 255, 1)"
                      ]
                    }}
                    transition={{ 
                      duration: 3, 
                      repeat: Infinity, 
                      ease: "linear" 
                    }}
                    className="flex-1 py-3 bg-white/5 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Credits
                  </motion.button>
                  <button 
                    onClick={() => setShowHowToPlay(true)}
                    className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
                  >
                    Help
                  </button>
                </div>
              </motion.div>

            </div>

            {/* Bottom Center: Join World */}
            <div className="absolute bottom-12 left-0 right-0 flex justify-center">
              <motion.button 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleStartPlaying}
                className="group relative px-16 py-6 bg-cyan-500 rounded-full overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.4)]"
              >
                <motion.div 
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.6, 0.3]
                  }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 bg-white"
                />
                <div className="relative flex items-center gap-4 text-black font-black uppercase tracking-[0.3em] text-lg">
                  <Play size={24} fill="black" />
                  <span>Enter Lobby</span>
                </div>
              </motion.button>
            </div>

            {/* Footer Info */}
            <div className="absolute bottom-4 left-8 text-[8px] font-black text-white/10 uppercase tracking-[0.4em] pointer-events-none">
              Build v2.4.0-Neon // Stable Connection
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 overflow-hidden bg-[#050505]"
            ref={containerRef}
          >
            <canvas ref={canvasRef} className="block w-full h-full touch-none" />
            
            {/* Orientation Warning */}
            <AnimatePresence>
              {isPortrait && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-8 text-center md:hidden"
                >
                  <div className="w-20 h-20 border-4 border-cyan-500 rounded-2xl flex items-center justify-center mb-6 animate-pulse">
                    <motion.div 
                      animate={{ rotate: 90 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <MoveRight className="text-cyan-400" size={40} />
                    </motion.div>
                  </div>
                  <h2 className="text-2xl font-black uppercase italic text-cyan-400 mb-2">Rotate Device</h2>
                  <p className="text-white/40 text-sm uppercase tracking-widest font-bold">Please play in landscape mode for the best experience</p>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* UI Overlays */}
            <div className="absolute top-10 left-6 md:top-6 text-cyan-400 pointer-events-none">
              <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase italic leading-none">Meow Singh</h1>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-40">Level {currentLevel + 1} • Room: {roomId}</p>
                {isGameStarted && (
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-[10px] font-black text-cyan-400 animate-pulse">
                      {elapsedTime}s
                    </div>
                    <div className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[10px] font-black text-white/40">
                      {Math.abs(Math.round(localPlayerRef.current?.state.vx || 0))} MPH
                    </div>
                  </div>
                )}
              </div>
              
              {/* Progress Bar */}
              {isGameStarted && (
                <div className="mt-4 w-48 h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(localPlayerRef.current?.state.x || 0) / MAP_WIDTH * 100}%` }}
                    className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
                  />
                </div>
              )}
            </div>

            <div className="absolute top-10 right-6 md:top-6 flex gap-3">
              <button 
                onClick={() => setShowMiniMap(!showMiniMap)}
                className={`p-3 border rounded-full transition-all ${showMiniMap ? 'bg-cyan-500 text-black border-cyan-500' : 'bg-black/50 border-white/10 text-white/50 hover:border-white/30'}`}
              >
                <MapIcon size={20} />
              </button>
              <button 
                onClick={() => setGameState("landing")}
                className="px-6 py-3 bg-black/50 border border-white/10 rounded-full text-white/50 text-xs font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all"
              >
                Exit
              </button>
            </div>

            {/* Lobby UI */}
            <div className="absolute top-32 left-6 md:top-24 flex flex-col gap-2 bg-black/60 backdrop-blur-xl p-3 md:p-5 rounded-2xl border border-white/10 max-h-[60vh] overflow-y-auto min-w-[200px] shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-col">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400 mb-1">
                    Arena Status
                  </h4>
                  <p className="text-xs font-bold text-white/80">
                    {isGameStarted ? "Race In Progress" : "Lobby Waiting"}
                  </p>
                </div>
                <button 
                  onClick={resetRoom}
                  className="px-3 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-[10px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500 hover:text-white transition-all"
                >
                  Reset
                </button>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full ${isReady ? 'bg-cyan-400 animate-pulse shadow-[0_0_15px_rgba(34,211,238,0.8)]' : 'bg-white/20'}`} />
                    <div className="flex flex-col">
                      <span className={`text-sm font-black ${isReady ? 'text-cyan-400' : 'text-white/60'}`}>You</span>
                      <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Local Player</span>
                    </div>
                  </div>
                  {isReady && <span className="text-[10px] font-black text-cyan-400 uppercase italic tracking-tighter">Ready</span>}
                </div>

                {Array.from(remotePlayers.values()).map((rp: GamePlayer) => (
                  <div key={rp.state.id} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${playerReadyStates[rp.state.id] ? 'bg-cyan-400 animate-pulse shadow-[0_0_15px_rgba(34,211,238,0.8)]' : 'bg-white/20'}`} />
                      <div className="flex flex-col">
                        <span className={`text-sm font-black ${playerReadyStates[rp.state.id] ? 'text-cyan-400' : 'text-white/60'}`}>{rp.state.name}</span>
                        <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Remote Player</span>
                      </div>
                    </div>
                    {playerReadyStates[rp.state.id] && <span className="text-[10px] font-black text-cyan-400 uppercase italic tracking-tighter">Ready</span>}
                  </div>
                ))}
              </div>

              {!isGameStarted && (
                <button 
                  onClick={toggleReady}
                  className={`mt-6 w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all transform active:scale-95 ${isReady ? 'bg-white/5 text-white/30 border border-white/10' : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_40px_rgba(6,182,212,0.6)]'}`}
                >
                  {isReady ? 'Cancel Ready' : 'Ready Up'}
                </button>
              )}

              {isGameStarted && (
                <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                  <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Race Active</p>
                  <p className="text-[9px] text-white/40 mt-1">Wait for next round or reset</p>
                </div>
              )}
            </div>

            {/* Countdown Overlay */}
            <AnimatePresence>
              {countdown !== null && (
                <motion.div 
                  initial={{ scale: 2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  <span className="text-[12rem] font-black italic text-cyan-400 drop-shadow-[0_0_50px_rgba(6,182,212,0.5)]">
                    {countdown === 0 ? "GO!" : countdown}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Mobile Controls */}
            <div className="absolute bottom-6 left-6 flex flex-col gap-4 md:hidden">
              <div className="flex gap-4">
                <button 
                  onPointerDown={() => handleMove(-1)}
                  onPointerUp={() => handleMove(0)}
                  onPointerCancel={() => handleMove(0)}
                  className="w-16 h-16 bg-black/40 backdrop-blur-md border-2 border-white/10 rounded-2xl flex items-center justify-center text-white/50 active:bg-cyan-500 active:text-black active:border-cyan-500 transition-all select-none touch-none"
                >
                  <MoveLeft size={32} />
                </button>
                <button 
                  onPointerDown={() => handleMove(1)}
                  onPointerUp={() => handleMove(0)}
                  onPointerCancel={() => handleMove(0)}
                  className="w-16 h-16 bg-black/40 backdrop-blur-md border-2 border-white/10 rounded-2xl flex items-center justify-center text-white/50 active:bg-cyan-500 active:text-black active:border-cyan-500 transition-all select-none touch-none"
                >
                  <MoveRight size={32} />
                </button>
              </div>
              
              {/* Emote Selector Mobile */}
              <div className="flex gap-2 bg-black/40 backdrop-blur-md p-2 rounded-2xl border border-white/5">
                {["🐱", "🔥", "⚡", "💀", "GG"].map(emote => (
                  <button
                    key={emote}
                    onClick={() => sendEmote(emote)}
                    className="w-10 h-10 flex items-center justify-center text-xl hover:scale-125 transition-transform"
                  >
                    {emote}
                  </button>
                ))}
              </div>
            </div>

            <div className="absolute bottom-6 right-6 md:hidden">
              <button 
                onPointerDown={() => handleJump()}
                className="w-20 h-20 bg-cyan-500/10 backdrop-blur-md border-4 border-cyan-500 rounded-full flex items-center justify-center text-cyan-400 active:bg-cyan-500 active:text-black shadow-[0_0_30px_rgba(6,182,212,0.3)] transition-all"
              >
                <ArrowUp size={40} />
              </button>
            </div>

            {/* Desktop Emote Selector */}
            <div className="absolute bottom-6 right-6 hidden md:flex gap-3 bg-black/40 backdrop-blur-md p-3 rounded-full border border-white/5">
              {["🐱", "🔥", "⚡", "💀", "GG"].map(emote => (
                <button
                  key={emote}
                  onClick={() => sendEmote(emote)}
                  className="w-10 h-10 flex items-center justify-center text-xl hover:scale-125 transition-transform"
                >
                  {emote}
                </button>
              ))}
            </div>

            {/* Desktop Instructions */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-2 bg-black/40 backdrop-blur-md border border-white/5 rounded-full text-white/30 text-[10px] font-black uppercase tracking-[0.3em] hidden md:block">
              WASD / Arrows to Move • Space to Jump • Double Jump Enabled
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credits Modal */}
      <AnimatePresence>
        {showCredits && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-[40px] p-12 text-center overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-purple-500 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 pointer-events-none" />
              
              <h2 className="text-3xl font-black uppercase tracking-tighter italic text-white mb-2">Development Credits</h2>
              <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mb-8">Meow Singh Parkour</p>

              <div className="space-y-8 relative z-10">
                <div>
                  <p className="text-white/60 text-xs font-bold uppercase tracking-widest mb-2">Created By</p>
                  <p className="text-white font-black text-xl tracking-tight">govind and gopu creations</p>
                </div>

                <div className="pt-4">
                  <a 
                    href="https://www.instagram.com/w_shaurya._?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 rounded-2xl text-white font-black text-xs uppercase tracking-widest transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(219,39,119,0.5)] active:scale-95"
                  >
                    <Instagram size={18} />
                    <span>Follow Shaurya</span>
                  </a>
                </div>
              </div>

              <button 
                onClick={() => setShowCredits(false)}
                className="mt-12 w-full py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white/50 text-[10px] font-black uppercase tracking-[0.3em] transition-all"
              >
                Close Credits
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* How to Play Modal */}
      <AnimatePresence>
        {showHowToPlay && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-[40px] p-12 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent" />
              
              <button 
                onClick={() => setShowHowToPlay(false)}
                className="absolute top-8 right-8 p-2 text-white/20 hover:text-white transition-colors"
              >
                <X size={24} />
              </button>

              <h2 className="text-4xl font-black uppercase tracking-tighter italic mb-8">How to Play</h2>

              <div className="space-y-8">
                <div className="flex gap-6">
                  <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex items-center justify-center text-cyan-400 font-black shrink-0">1</div>
                  <div>
                    <h4 className="font-black uppercase tracking-tighter mb-1">Movement</h4>
                    <p className="text-sm text-white/40">Use <span className="text-white font-bold">WASD</span> or <span className="text-white font-bold">Arrow Keys</span> to run. On mobile, use the on-screen directional pads.</p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex items-center justify-center text-cyan-400 font-black shrink-0">2</div>
                  <div>
                    <h4 className="font-black uppercase tracking-tighter mb-1">Jumping</h4>
                    <p className="text-sm text-white/40">Press <span className="text-white font-bold">Space</span> or <span className="text-white font-bold">Up Arrow</span> to jump. Press it again while in the air for a <span className="text-cyan-400 font-bold italic">Double Jump</span>.</p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex items-center justify-center text-cyan-400 font-black shrink-0">3</div>
                  <div>
                    <h4 className="font-black uppercase tracking-tighter mb-1">Obstacles</h4>
                    <p className="text-sm text-white/40">Avoid <span className="text-red-500 font-bold italic">Red Hazard Platforms</span>. Reach the <span className="text-green-400 font-bold italic">Green Goal</span> to win the round!</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowHowToPlay(false)}
                className="mt-12 w-full py-4 bg-white text-black font-black uppercase tracking-tighter rounded-2xl hover:bg-cyan-500 transition-colors"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
