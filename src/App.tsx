import React, { useEffect, useRef, useState } from "react";
import { GamePlayer } from "./game/Player";
import { Particle } from "./game/Particle";
import { LEVELS, MAP_WIDTH, MAP_HEIGHT } from "./game/constants";
import { MoveLeft, MoveRight, ArrowUp, Map as MapIcon, Play, Info, Trophy, Github, Twitter, X, CheckCircle2, Circle, User } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { db, auth, signInWithGoogle } from "./lib/firebase";
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
  runTransaction
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

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
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
  throw new Error(JSON.stringify(errInfo));
}

type GameState = "landing" | "playing";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [user, setUser] = useState<any>(null);
  const [gameState, setGameState] = useState<GameState>("landing");
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [roomId, setRoomId] = useState("lobby");
  const [tempRoomId, setTempRoomId] = useState("");
  const [currentLevel, setCurrentLevel] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [playerName, setPlayerName] = useState("Meow Singh");
  const [playerColor, setPlayerColor] = useState("#00ffcc");
  const [localPlayer, setLocalPlayer] = useState<GamePlayer>(() => {
    return new GamePlayer("local", 100, 100, "#00ffcc", "Meow Singh", true);
  });
  const [remotePlayers, setRemotePlayers] = useState<Map<string, GamePlayer>>(new Map());
  const [playerReadyStates, setPlayerReadyStates] = useState<Record<string, boolean>>({});
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [screenShake, setScreenShake] = useState(0);
  const [levelStartTime, setLevelStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [playerShape, setPlayerShape] = useState<"square" | "circle" | "triangle">("square");
  
  const keys = useRef<Record<string, boolean>>({});
  const mobileDir = useRef<number>(0);
  const requestRef = useRef<number>(0);
  const localPlayerRef = useRef<GamePlayer>(localPlayer);
  const remotePlayersRef = useRef<Map<string, GamePlayer>>(remotePlayers);
  const showMiniMapRef = useRef<boolean>(showMiniMap);
  const gameStateRef = useRef<GameState>(gameState);
  const currentLevelRef = useRef<number>(currentLevel);
  const isGameStartedRef = useRef<boolean>(isGameStarted);
  const particlesRef = useRef<Particle[]>([]);
  const screenShakeRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);

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
        }
        if (data.countdown !== undefined) {
          setCountdown(data.countdown);
        } else {
          setCountdown(null);
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
      
      snapshot.docChanges().forEach((change) => {
        const data = change.doc.data();
        const id = change.doc.id;
        
        if (id === user.uid) {
          // Local player state sync if needed (usually we push state)
          setIsReady(data.ready);
        } else {
          if (change.type === "added" || change.type === "modified") {
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
          } else if (change.type === "removed") {
            remotes.delete(id);
            delete readyStates[id];
          }
        }
      });

      // Update all ready states
      snapshot.docs.forEach(doc => {
        if (doc.id !== user.uid) {
          readyStates[doc.id] = doc.data().ready;
        }
      });

      setRemotePlayers(remotes);
      setPlayerReadyStates(readyStates);

      // Check for countdown trigger (if all ready)
      const allPlayers = snapshot.docs.map(d => d.data());
      const allReady = allPlayers.length > 0 && allPlayers.every(p => p.ready);
      
      if (allReady && !isGameStartedRef.current) {
        checkAndStartCountdown(allPlayers.length);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `rooms/${roomId}/players`);
    });

    return () => {
      unsubscribeRoom();
      unsubscribePlayers();
      // Cleanup: remove player from room
      deleteDoc(doc(db, "rooms", roomId, "players", user.uid))
        .catch(e => console.error("Error removing player on cleanup", e));
    };
  }, [gameState, user, roomId]);

  const checkAndStartCountdown = async (playerCount: number) => {
    if (playerCount === 0) return;
    const roomRef = doc(db, "rooms", roomId);
    try {
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists() && !roomSnap.data().isCountingDown && !roomSnap.data().isGameStarted) {
        await updateDoc(roomRef, { isCountingDown: true, countdown: 3 });
        
        const playersSnap = await getDocs(collection(db, "rooms", roomId, "players"));
        const hostId = playersSnap.docs[0].id;
        
        if (hostId === user.uid) {
          let count = 3;
          const interval = setInterval(async () => {
            count--;
            try {
              if (count < 0) {
                clearInterval(interval);
                await updateDoc(roomRef, { isCountingDown: false, isGameStarted: true, countdown: null });
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
      handleFirestoreError(e, OperationType.GET, `rooms/${roomId}`);
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
    const newParticles = [];
    for (let i = 0; i < count; i++) {
      newParticles.push(new Particle(x, y, color));
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  useEffect(() => {
    const p = localPlayerRef.current;
    if (p) {
      p.onJump = () => {
        createParticles(p.state.x + p.width / 2, p.state.y + p.height, p.state.color, 5);
      };
      p.onDoubleJump = () => {
        setScreenShake(5);
        createParticles(p.state.x + p.width / 2, p.state.y + p.height / 2, "#ffffff", 15);
      };
      p.onLand = () => {
        createParticles(p.state.x + p.width / 2, p.state.y + p.height, p.state.color, 8);
      };
      p.onDeath = () => {
        setScreenShake(15);
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
    if (gameStateRef.current !== "playing" || !isGameStartedRef.current) return;
    
    const p = localPlayerRef.current;
    if (p) {
      let dir = mobileDir.current;
      if (keys.current["ArrowLeft"] || keys.current["KeyA"]) dir -= 1;
      if (keys.current["ArrowRight"] || keys.current["KeyD"]) dir += 1;
      
      const currentPlatforms = LEVELS[currentLevelRef.current] || [];
      p.move(dir);
      p.update(currentPlatforms);

      if (p.reachedGoal) {
        handleLevelComplete();
        createParticles(p.state.x + p.width / 2, p.state.y + p.height / 2, "#a855f7", 30);
      }

      // Throttled movement update
      const now = Date.now();
      if (now - lastUpdateRef.current > 50 && user) {
        lastUpdateRef.current = now;
        updateDoc(doc(db, "rooms", roomId, "players", user.uid), {
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
    }

    // Update particles
    setParticles(prev => {
      const next = prev.filter(p => p.life > 0);
      next.forEach(p => p.update());
      return next;
    });

    // Update screen shake
    if (screenShakeRef.current > 0) {
      setScreenShake(prev => Math.max(0, prev - 1));
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const p = localPlayerRef.current;
    if (!p) return;

    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Camera offset
    const offsetX = Math.max(0, Math.min(p.state.x - width / 2, MAP_WIDTH - width));
    const offsetY = Math.max(0, Math.min(p.state.y - height / 2, MAP_HEIGHT - height));

    // Apply screen shake
    ctx.save();
    if (screenShakeRef.current > 0) {
      const dx = (Math.random() - 0.5) * screenShakeRef.current;
      const dy = (Math.random() - 0.5) * screenShakeRef.current;
      ctx.translate(dx, dy);
    }

    // Parallax Background
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, width, height);
    
    // Far stars/grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    const gridSize = 100;
    const parallaxX = (offsetX * 0.3) % gridSize;
    const parallaxY = (offsetY * 0.3) % gridSize;
    for (let x = -parallaxX; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = -parallaxY; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw platforms
    const currentPlatforms = LEVELS[currentLevelRef.current] || [];
    currentPlatforms.forEach((plat) => {
      ctx.save();
      ctx.shadowBlur = 10;
      if (plat.type === "hazard") {
        ctx.shadowColor = "#ff0055";
        ctx.fillStyle = "#ff0055";
      } else if (plat.type === "goal") {
        ctx.shadowColor = "#a855f7";
        ctx.fillStyle = "#a855f7";
      } else {
        ctx.shadowColor = "#00ffcc";
        ctx.fillStyle = "#00ffcc";
      }
      ctx.fillRect(plat.x - offsetX, plat.y - offsetY, plat.width, plat.height);
      ctx.restore();
    });

    // Draw remote players
    remotePlayersRef.current.forEach((rp) => {
      rp.draw(ctx, offsetX, offsetY);
    });

    // Draw local player
    p.draw(ctx, offsetX, offsetY);

    // Draw particles
    particlesRef.current.forEach(p => p.draw(ctx, offsetX, offsetY));

    ctx.restore(); // End screen shake

    // Draw Mini Map
    if (showMiniMapRef.current) {
      const mw = 200;
      const mh = 150;
      const mx = width - mw - 20;
      const my = 20;
      
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeRect(mx, my, mw, mh);
      
      const scaleX = mw / MAP_WIDTH;
      const scaleY = mh / MAP_HEIGHT;
      
      // Draw platforms on mini map
      ctx.fillStyle = "rgba(0, 204, 255, 0.5)";
      currentPlatforms.forEach(plat => {
        ctx.fillRect(mx + plat.x * scaleX, my + plat.y * scaleY, plat.width * scaleX, plat.height * scaleY);
      });
      
      // Local player on mini map
      ctx.fillStyle = p.state.color;
      ctx.fillRect(mx + p.state.x * scaleX - 2, my + p.state.y * scaleY - 2, 4, 4);
      
      // Remote players on mini map
      remotePlayersRef.current.forEach(rp => {
        ctx.fillStyle = rp.state.color;
        ctx.fillRect(mx + rp.state.x * scaleX - 2, my + rp.state.y * scaleY - 2, 4, 4);
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
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
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
        currentUser = await signInWithGoogle();
      } catch (e) {
        console.error("Sign in failed", e);
        alert("Please sign in to play!");
        return;
      }
    }

    if (!currentUser) {
      alert("Authentication failed. Please try again.");
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
        y: 100,
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
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const nextLevel = roomSnap.data().currentLevel + 1;
        if (nextLevel < LEVELS.length) {
          await updateDoc(roomRef, { 
            currentLevel: nextLevel, 
            isGameStarted: false,
            isCountingDown: false
          });
          // Reset all players ready state
          const playersSnap = await getDocs(collection(db, "rooms", roomId, "players"));
          playersSnap.docs.forEach(async (d) => {
            await updateDoc(d.ref, { ready: false, x: 100, y: 100 })
              .catch(e => console.error("Player reset failed", e));
          });
        } else {
          alert("Congratulations! You've completed all levels!");
          await updateDoc(roomRef, { currentLevel: 0, isGameStarted: false });
          setGameState("landing");
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `rooms/${roomId}`);
    }
  };

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#050505] font-sans text-white">
      <AnimatePresence mode="wait">
        {gameState === "landing" ? (
          <motion.div 
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center bg-[#050505] p-6 text-center overflow-y-auto"
          >
            {/* Background Glow */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-cyan-500/10 blur-[120px] rounded-full pointer-events-none" />
            
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="relative z-10 w-full max-w-5xl my-auto"
            >
              <div className="mb-4 inline-block px-4 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400 text-[10px] font-black uppercase tracking-[0.2em]">
                Version 1.0.0 Alpha
              </div>
              <h1 className="text-5xl md:text-9xl font-black tracking-tighter uppercase italic text-transparent bg-clip-text bg-gradient-to-b from-cyan-400 to-blue-600 mb-2 leading-none">
                Meow Singh
              </h1>
              <h2 className="text-xl md:text-4xl font-bold tracking-[0.3em] uppercase text-cyan-400/50 mb-8 md:mb-12">
                Parkour Multiplayer
              </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {/* Customization Section */}
              <div className="p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md text-left">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4 flex items-center gap-2">
                  <User size={14} /> Character Profile
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-white/50 mb-1.5 block">Display Name</label>
                    <input 
                      type="text" 
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Enter Name..."
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-all"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-white/50 mb-1.5 block">Character Shape</label>
                    <div className="flex gap-2">
                      {(["square", "circle", "triangle"] as const).map(shape => (
                        <button
                          key={shape}
                          onClick={() => setPlayerShape(shape)}
                          className={`w-10 h-10 rounded-xl border-2 transition-all flex items-center justify-center ${playerShape === shape ? 'border-cyan-500 bg-cyan-500/20' : 'border-white/10 bg-white/5 opacity-50 hover:opacity-100'}`}
                        >
                          <div className={`w-4 h-4 border-2 border-white ${shape === 'circle' ? 'rounded-full' : shape === 'triangle' ? '' : 'rounded-sm'}`} 
                               style={{ clipPath: shape === 'triangle' ? 'polygon(50% 0%, 0% 100%, 100% 100%)' : 'none' }}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-white/50 mb-1.5 block">Neon Color</label>
                    <div className="flex gap-2">
                      {["#00ffcc", "#ff0055", "#a855f7", "#fbbf24", "#3b82f6"].map(color => (
                        <button
                          key={color}
                          onClick={() => setPlayerColor(color)}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${playerColor === color ? 'border-white scale-110' : 'border-transparent opacity-50 hover:opacity-100'}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Room Section */}
              <div className="p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-md text-left">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/30 mb-4 flex items-center gap-2">
                  <MapIcon size={14} /> Session Lobby
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-white/50 mb-1.5 block">Private Room ID</label>
                    <input 
                      type="text" 
                      value={tempRoomId}
                      onChange={(e) => setTempRoomId(e.target.value)}
                      placeholder="lobby (default)"
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500 transition-all"
                    />
                  </div>
                  <div className="flex gap-2">
                    {!user ? (
                      <button 
                        onClick={() => signInWithGoogle().catch(e => console.error("Sign in failed", e))}
                        className="flex-1 group relative flex items-center justify-center gap-3 bg-white text-black font-black uppercase tracking-tighter py-4 rounded-xl transition-all overflow-hidden"
                      >
                        <User size={20} fill="black" />
                        <span>Sign In with Google</span>
                        <div className="absolute inset-0 bg-black/5 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                      </button>
                    ) : (
                      <button 
                        onClick={handleStartPlaying}
                        className="flex-1 group relative flex items-center justify-center gap-3 bg-cyan-500 hover:bg-cyan-400 text-black font-black uppercase tracking-tighter py-4 rounded-xl transition-all overflow-hidden"
                      >
                        <Play size={20} fill="black" />
                        <span>Enter Arena</span>
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500" />
                      </button>
                    )}
                    <button 
                      onClick={() => setShowHowToPlay(true)}
                      className="px-4 py-4 bg-white/5 border border-white/10 rounded-xl text-white/50 hover:text-white hover:border-white/30 transition-all"
                      title="How to Play"
                    >
                      <Info size={20} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <div className="p-8 bg-white/[0.02] border border-white/10 rounded-3xl hover:bg-white/[0.04] transition-colors">
                  <Trophy className="text-cyan-400 mb-6" size={40} />
                  <h3 className="text-xl font-black uppercase tracking-tighter mb-3">Multiplayer</h3>
                  <p className="text-sm text-white/40 leading-relaxed">Race against players worldwide in real-time neon environments. Master the tracks and dominate the leaderboard.</p>
                </div>
                <div className="p-8 bg-white/[0.02] border border-white/10 rounded-3xl hover:bg-white/[0.04] transition-colors">
                  <Play className="text-cyan-400 mb-6" size={40} />
                  <h3 className="text-xl font-black uppercase tracking-tighter mb-3">Fast Paced</h3>
                  <p className="text-sm text-white/40 leading-relaxed">Master double jumps, wall kicks, and momentum to conquer the parkour tracks. Every millisecond counts.</p>
                </div>
                <div className="p-8 bg-white/[0.02] border border-white/10 rounded-3xl hover:bg-white/[0.04] transition-colors">
                  <MapIcon className="text-cyan-400 mb-6" size={40} />
                  <h3 className="text-xl font-black uppercase tracking-tighter mb-3">Neon World</h3>
                  <p className="text-sm text-white/40 leading-relaxed">Immerse yourself in a high-contrast, glowing cyberpunk aesthetic. A visual feast of light and speed.</p>
                </div>
              </div>
            </motion.div>

            {/* Footer */}
            <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-12 text-white/20 text-[10px] uppercase tracking-[0.2em] font-black">
              <a href="#" className="hover:text-cyan-400 transition-colors flex items-center gap-2">
                <Github size={14} /> GitHub
              </a>
              <a href="#" className="hover:text-cyan-400 transition-colors flex items-center gap-2">
                <Twitter size={14} /> Twitter
              </a>
              <span>© 2026 Meow Singh Games</span>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="game"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0"
          >
            <canvas ref={canvasRef} className="block w-full h-full touch-none" />
            
            {/* UI Overlays */}
            <div className="absolute top-6 left-6 text-cyan-400 pointer-events-none">
              <h1 className="text-3xl font-black tracking-tighter uppercase italic leading-none">Meow Singh</h1>
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

            <div className="absolute top-6 right-6 flex gap-3">
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

            {/* Ready Status List */}
            {!isGameStarted && (
              <div className="absolute top-24 left-6 flex flex-col gap-2 bg-black/40 backdrop-blur-md p-4 rounded-2xl border border-white/5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Players Ready</h4>
                <div className="flex items-center gap-2 text-sm">
                  {isReady ? <CheckCircle2 size={16} className="text-cyan-400" /> : <Circle size={16} className="text-white/20" />}
                  <span className={isReady ? "text-cyan-400 font-bold" : "text-white/50"}>You</span>
                </div>
                {Array.from(remotePlayers.values()).map((rp: GamePlayer) => (
                  <div key={rp.state.id} className="flex items-center gap-2 text-sm">
                    {playerReadyStates[rp.state.id] ? <CheckCircle2 size={16} className="text-cyan-400" /> : <Circle size={16} className="text-white/20" />}
                    <span className={playerReadyStates[rp.state.id] ? "text-cyan-400 font-bold" : "text-white/50"}>{rp.state.name}</span>
                  </div>
                ))}
                <button 
                  onClick={toggleReady}
                  className={`mt-4 px-6 py-2 rounded-full font-black uppercase tracking-tighter text-xs transition-all ${isReady ? 'bg-white/10 text-white/50' : 'bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.3)]'}`}
                >
                  {isReady ? 'Unready' : 'Ready Up'}
                </button>
              </div>
            )}

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
