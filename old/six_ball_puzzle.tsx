import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, RotateCw, RotateCcw, ArrowLeft, ArrowRight, ArrowDown, ArrowUp, RefreshCw } from 'lucide-react';

// --- Constants & Types ---

const VISIBLE_ROWS = 15; 
const HIDDEN_ROWS = 5;   
const TOTAL_ROWS = VISIBLE_ROWS + HIDDEN_ROWS;
const COLS = 9; 
const BALL_RADIUS = 18; 
const HEX_WIDTH = BALL_RADIUS * 2;
const HEX_HEIGHT = BALL_RADIUS * Math.sqrt(3);
const ROW_HEIGHT = HEX_HEIGHT * 0.85; 

const COLORS = [
  '#FF4444', // Red
  '#4444FF', // Blue
  '#44AA44', // Green
  '#AA44AA', // Purple
  '#EEEE44', // Yellow
  '#44EEEE', // Cyan
];

const EMPTY = -1;

type Grid = number[][];

interface Position {
  r: number;
  c: number;
}

interface BallRelative {
  dx: number;
  dy: number;
  color: number;
}

interface FloatingPiece {
  x: number; 
  y: number; 
  balls: BallRelative[]; 
  rotationState: 0 | 1; // 0: InvTriangle(▽), 1: Triangle(△)
}

// --- Helper Functions ---

const getHexPos = (r: number, c: number) => {
  const visibleR = r - HIDDEN_ROWS;
  const isOdd = r % 2 !== 0;
  const x = c * HEX_WIDTH + (isOdd ? HEX_WIDTH / 2 : 0) + HEX_WIDTH / 2;
  const y = visibleR * ROW_HEIGHT + HEX_HEIGHT / 2;
  return { x, y };
};

const isValidPos = (r: number, c: number) => {
  if (r < 0 || r >= TOTAL_ROWS) return false;
  if (c < 0 || c >= COLS) return false;
  return true;
};

const getNeighbors = (r: number, c: number) => {
  const isOdd = r % 2 !== 0;
  const neighbors: Position[] = [];
  
  const offsets = isOdd
    ? [
        { r: -1, c: 0 }, { r: -1, c: 1 }, 
        { r: 0, c: -1 }, { r: 0, c: 1 },  
        { r: 1, c: 0 }, { r: 1, c: 1 }    
      ]
    : [
        { r: -1, c: -1 }, { r: -1, c: 0 }, 
        { r: 0, c: -1 }, { r: 0, c: 1 },   
        { r: 1, c: -1 }, { r: 1, c: 0 }    
      ];

  for (const o of offsets) {
    const nr = r + o.r;
    const nc = c + o.c;
    if (isValidPos(nr, nc)) neighbors.push({ r: nr, c: nc });
  }
  return neighbors;
};

const getBottomNeighbors = (r: number, c: number) => {
  const isOdd = r % 2 !== 0;
  if (isOdd) {
    return [{ r: r + 1, c: c }, { r: r + 1, c: c + 1 }];
  } else {
    return [{ r: r + 1, c: c - 1 }, { r: r + 1, c: c }];
  }
};

// --- Main Component ---

export default function SixBallPuzzle() {
  const [grid, setGrid] = useState<Grid>([]);
  const [activePiece, setActivePiece] = useState<FloatingPiece | null>(null);
  const [nextColors, setNextColors] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'START' | 'PLAYING' | 'SETTLING' | 'GAME_OVER'>('START');
  const [message, setMessage] = useState('');

  const gridRef = useRef<Grid>([]);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);
  const dropTimerRef = useRef<number>(0);
  const settleTimerRef = useRef<number>(0);
  const keysPressed = useRef<{ [key: string]: boolean }>({});
  
  const DROP_INTERVAL = 800; 
  const SETTLE_INTERVAL = 50; 
  const MOVE_SPEED_X = 0.015; 
  const MOVE_SPEED_Y = 0.02;

  // Initialize Game
  const initGame = useCallback(() => {
    const newGrid = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(EMPTY));
    setGrid(newGrid);
    gridRef.current = newGrid;
    setScore(0);
    
    const initialNext = generateNextColors();
    setNextColors(initialNext);
    spawnPiece(generateNextColors());
    
    setGameState('PLAYING');
    setMessage('');
  }, []);

  const generateNextColors = () => {
    return [
      Math.floor(Math.random() * COLORS.length),
      Math.floor(Math.random() * COLORS.length),
      Math.floor(Math.random() * COLORS.length)
    ];
  };

  const spawnPiece = (colors: number[]) => {
    // Start at x=3.5 to align with Even Row center (0.5, 1.5, 2.5, 3.5...)
    const newPiece: FloatingPiece = {
      x: 3.5, 
      y: 2.0, 
      balls: [
        { dx: 0, dy: 0, color: colors[0] },       // Bottom
        { dx: -0.5, dy: -1, color: colors[1] },   // Top Left
        { dx: 0.5, dy: -1, color: colors[2] },    // Top Right
      ],
      rotationState: 0
    };
    setActivePiece(newPiece);
    setNextColors(generateNextColors());
  };

  // --- Physics Engine ---

  const runPhysicsStep = (currentGrid: Grid): { newGrid: Grid, moved: boolean } => {
    const newGrid = currentGrid.map(row => [...row]);
    let moved = false;
    
    for (let r = TOTAL_ROWS - 2; r >= 0; r--) {
      for (let c = 0; c < COLS; c++) {
        const color = newGrid[r][c];
        if (color === EMPTY) continue;

        const neighbors = getBottomNeighbors(r, c);
        const dl = neighbors[0];
        const dr = neighbors[1];

        let canGoDL = isValidPos(dl.r, dl.c) && newGrid[dl.r][dl.c] === EMPTY;
        let canGoDR = isValidPos(dr.r, dr.c) && newGrid[dr.r][dr.c] === EMPTY;

        if (canGoDL && canGoDR) {
           if (Math.random() < 0.5) {
             newGrid[dl.r][dl.c] = color;
             newGrid[r][c] = EMPTY;
           } else {
             newGrid[dr.r][dr.c] = color;
             newGrid[r][c] = EMPTY;
           }
           moved = true;
        } else if (canGoDL) {
          newGrid[dl.r][dl.c] = color;
          newGrid[r][c] = EMPTY;
          moved = true;
        } else if (canGoDR) {
          newGrid[dr.r][dr.c] = color;
          newGrid[r][c] = EMPTY;
          moved = true;
        }
      }
    }
    return { newGrid, moved };
  };

  const checkMatches = (currentGrid: Grid): { newGrid: Grid, points: number } => {
    const visited = new Set<string>();
    const matches: Position[] = [];
    const getPosKey = (r: number, c: number) => `${r},${c}`;

    for (let r = 0; r < TOTAL_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (currentGrid[r][c] === EMPTY || visited.has(getPosKey(r, c))) continue;

        const color = currentGrid[r][c];
        const group: Position[] = [];
        const queue: Position[] = [{ r, c }];
        visited.add(getPosKey(r, c));
        group.push({ r, c });

        while (queue.length > 0) {
          const curr = queue.shift()!;
          const neighbors = getNeighbors(curr.r, curr.c);
          for (const n of neighbors) {
            if (currentGrid[n.r][n.c] === color && !visited.has(getPosKey(n.r, n.c))) {
              visited.add(getPosKey(n.r, n.c));
              group.push(n);
              queue.push(n);
            }
          }
        }

        if (group.length >= 6) {
          matches.push(...group);
        }
      }
    }

    if (matches.length > 0) {
      const nextGrid = currentGrid.map(row => [...row]);
      matches.forEach(p => { nextGrid[p.r][p.c] = EMPTY; });
      return { newGrid: nextGrid, points: matches.length * 100 + (matches.length - 6) * 50 };
    }
    return { newGrid: currentGrid, points: 0 };
  };

  // --- Game Loop ---

  const update = (time: number) => {
    if (gameState === 'GAME_OVER' || gameState === 'START') {
        requestRef.current = requestAnimationFrame(update);
        return;
    }

    const deltaTime = time - lastTimeRef.current;
    lastTimeRef.current = time;

    if (gameState === 'PLAYING') {
      // Handle continuous movement
      if (keysPressed.current['ArrowLeft'] || keysPressed.current['a'] || keysPressed.current['A']) {
        movePiece(-MOVE_SPEED_X * deltaTime, 0);
      }
      if (keysPressed.current['ArrowRight'] || keysPressed.current['d'] || keysPressed.current['D']) {
        movePiece(MOVE_SPEED_X * deltaTime, 0);
      }
      if (keysPressed.current['ArrowDown'] || keysPressed.current['s'] || keysPressed.current['S']) {
        movePiece(0, MOVE_SPEED_Y * deltaTime);
        dropTimerRef.current = 0; 
      }

      // Auto Drop
      dropTimerRef.current += deltaTime;
      if (dropTimerRef.current > DROP_INTERVAL) {
        movePiece(0, 1); 
        dropTimerRef.current = 0;
      }

    } else if (gameState === 'SETTLING') {
      settleTimerRef.current += deltaTime;
      if (settleTimerRef.current > SETTLE_INTERVAL) {
        const { newGrid, moved } = runPhysicsStep(gridRef.current);
        gridRef.current = newGrid;
        setGrid([...newGrid]); 
        
        if (!moved) {
          const matchResult = checkMatches(gridRef.current);
          if (matchResult.points > 0) {
            setScore(s => s + matchResult.points);
            gridRef.current = matchResult.newGrid;
            setGrid([...matchResult.newGrid]);
          } else {
            if (checkGameOver(gridRef.current)) {
              setGameState('GAME_OVER');
              setMessage('Game Over!');
            } else {
              setGameState('PLAYING');
              spawnPiece(nextColors);
            }
          }
        }
        settleTimerRef.current = 0;
      }
    }
    requestRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(requestRef.current!);
  }, [gameState]); 

  // --- Inputs ---

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'PLAYING') return;
      keysPressed.current[e.key] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
          e.preventDefault();
      }

      switch (e.key) {
        case 'ArrowUp': case 'w': case 'W': hardDrop(); break;
        case 'e': case 'E': rotatePiece('CW'); break;
        case 'q': case 'Q': rotatePiece('CCW'); break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // --- Logic Helpers ---

  const checkGameOver = (g: Grid) => {
    for (let r = 0; r < HIDDEN_ROWS; r++) {
        if (g[r].some(c => c !== EMPTY)) return true;
    }
    return false;
  };

  const checkCollision = (px: number, py: number, balls: BallRelative[]) => {
    for (const b of balls) {
      const r = Math.round(py + b.dy);
      const visualX = px + b.dx;
      const isOdd = r % 2 !== 0;
      
      const c = Math.floor(visualX - (isOdd ? 0.5 : 0));

      if (r >= TOTAL_ROWS) return true;
      if (c < 0 || c >= COLS) return true;
      if (r >= 0 && gridRef.current[r][c] !== EMPTY) return true;
    }
    return false;
  };

  const movePiece = (dx: number, dy: number) => {
    setActivePiece(prev => {
        if (!prev) return null;
        
        let nextX = prev.x;
        let nextY = prev.y;

        // 1. Horizontal Movement Check
        if (dx !== 0) {
            const testX = prev.x + dx;
            if (!checkCollision(testX, prev.y, prev.balls)) {
                nextX = testX;
            } else {
                // Wall slide handling is implicit: we just don't update X, but we allow Y below
            }
        }

        // 2. Vertical Movement Check
        if (dy !== 0) {
            const testY = prev.y + dy;
            if (!checkCollision(nextX, testY, prev.balls)) {
                nextY = testY;
            } else {
                // Collision when moving vertically.
                
                // Special Case: Hex Grid "Zigzag" Wall Collision.
                // When falling, row parity changes (Even->Odd->Even).
                // This can cause a collision with the wall (c<0 or c>=COLS) purely due to grid offset change,
                // even if visually it looks like it should slide down.
                // We try to "push" the piece slightly horizontally to keep it falling.
                
                if (dy > 0) {
                    // Try auto-correcting X position (Wall Kick for gravity)
                    // If we push Left or Right slightly, can we fall?
                    const pushRightX = nextX + 0.5;
                    const pushLeftX = nextX - 0.5;

                    // Check if pushing Right fixes it (e.g. hitting Left wall)
                    if (!checkCollision(pushRightX, testY, prev.balls)) {
                        return { ...prev, x: pushRightX, y: testY };
                    }
                    // Check if pushing Left fixes it (e.g. hitting Right wall)
                    if (!checkCollision(pushLeftX, testY, prev.balls)) {
                        return { ...prev, x: pushLeftX, y: testY };
                    }

                    // If we still collide, it's a real floor/ball collision.
                    // Only lock if it was a pure vertical move (or forced drop).
                    // To prevent instant lock on wall slide, we ensure we really can't go down.
                    setTimeout(() => lockPiece({ ...prev, x: nextX, y: prev.y }), 0);
                    return null;
                }
            }
        }

        return { ...prev, x: nextX, y: nextY };
    });
  };

  const lockPiece = (piece: FloatingPiece) => {
    const newGrid = gridRef.current.map(row => [...row]);
    
    piece.balls.forEach(b => {
      const r = Math.round(piece.y + b.dy);
      const visualX = piece.x + b.dx;
      const isOdd = r % 2 !== 0;
      const c = Math.floor(visualX - (isOdd ? 0.5 : 0));

      if (r >= 0 && r < TOTAL_ROWS && c >= 0 && c < COLS) {
        newGrid[r][c] = b.color;
      }
    });

    gridRef.current = newGrid;
    setGrid(newGrid);
    setGameState('SETTLING'); 
  };

  const hardDrop = () => {
    setActivePiece(prev => {
        if (!prev) return null;
        let currentY = prev.y;
        // Fall until collision
        // Note: This simple loop doesn't handle the zigzag wall kick logic above.
        // It might stop "early" at a wall edge, but that's acceptable for hard drop mechanics usually.
        while (!checkCollision(prev.x, currentY + 1, prev.balls)) {
          currentY += 1;
        }
        const droppedPiece = { ...prev, y: currentY };
        setTimeout(() => lockPiece(droppedPiece), 0);
        return null; 
    });
  };

  const rotatePiece = (dir: 'CW' | 'CCW') => {
    setActivePiece(prev => {
        if (!prev) return null;

        const nextState = prev.rotationState === 0 ? 1 : 0;
        
        const b0 = prev.balls[0]; 
        const b1 = prev.balls[1]; 
        const b2 = prev.balls[2]; 
        
        let newBalls: BallRelative[] = [];
        // ▽ (InvTriangle) shape
        const shape0 = [{dx:0, dy:0}, {dx:-0.5, dy:-1}, {dx:0.5, dy:-1}]; 
        // △ (Triangle) shape
        const shape1 = [{dx:0, dy:-1}, {dx:-0.5, dy:0}, {dx:0.5, dy:0}];
        
        const targetShape = nextState === 0 ? shape0 : shape1;
        
        // Rotate colors 60 degrees
        let c0, c1, c2;
        if (prev.rotationState === 0) { // ▽ -> △
            if (dir === 'CW') {
                c0 = b1.color; // Top gets TL
                c1 = b0.color; // BL gets Bot
                c2 = b2.color; // BR gets TR
            } else { // CCW
                c0 = b2.color; // Top gets TR
                c1 = b1.color; // BL gets TL
                c2 = b0.color; // BR gets Bot
            }
        } else { // △ -> ▽
            if (dir === 'CW') {
                c0 = b2.color; // Bot gets BR
                c1 = b1.color; // TL gets BL
                c2 = b0.color; // TR gets Top
            } else { // CCW
                c0 = b1.color; // Bot gets BL
                c1 = b0.color; // TL gets Top
                c2 = b2.color; // TR gets BR
            }
        }
        
        newBalls = [
            { ...targetShape[0], color: c0 },
            { ...targetShape[1], color: c1 },
            { ...targetShape[2], color: c2 },
        ];

        // Wall Kick (Simple): If rotation hits wall, try shifting left/right
        if (checkCollision(prev.x, prev.y, newBalls)) {
            // Try shifting Left
            if (!checkCollision(prev.x - 0.5, prev.y, newBalls)) {
                return { ...prev, x: prev.x - 0.5, balls: newBalls, rotationState: nextState };
            }
            // Try shifting Right
            if (!checkCollision(prev.x + 0.5, prev.y, newBalls)) {
                return { ...prev, x: prev.x + 0.5, balls: newBalls, rotationState: nextState };
            }
            // Can't rotate
            return prev;
        }

        return { ...prev, balls: newBalls, rotationState: nextState };
    });
  };

  // --- Rendering ---

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center font-sans select-none touch-none">
      
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          6-Ball Puzzle
        </h1>
        <p className="text-xs text-gray-400 mt-1">A/D: Move | Q/E: Rotate | S: Soft Drop | W: Hard Drop</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-start">
        
        <div className="relative bg-gray-800 border-4 border-gray-700 rounded-lg overflow-hidden shadow-2xl"
             style={{ width: COLS * HEX_WIDTH + HEX_WIDTH/2, height: VISIBLE_ROWS * ROW_HEIGHT + HEX_HEIGHT }}>
          
          {/* Grid Background */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            {Array.from({ length: VISIBLE_ROWS }).map((_, r) => (
              Array.from({ length: COLS }).map((_, c) => {
                const pos = getHexPos(r + HIDDEN_ROWS, c);
                return (
                  <div key={`${r}-${c}`} 
                       className="absolute border border-gray-500 rounded-full"
                       style={{
                         width: BALL_RADIUS * 2,
                         height: BALL_RADIUS * 2,
                         left: pos.x - BALL_RADIUS,
                         top: pos.y - BALL_RADIUS,
                       }} 
                  />
                );
              })
            ))}
          </div>
          
          {/* Game Over Line (Red Dashed) */}
          <div 
             className="absolute w-full border-b-4 border-red-600 border-dashed z-0 pointer-events-none opacity-70"
             style={{
                // Position exactly at top of visible area.
                top: 0, 
             }}
          />

          {/* Placed Balls */}
          {grid.map((row, r) => 
            row.map((colorIdx, c) => {
              if (colorIdx === EMPTY) return null;
              
              const pos = getHexPos(r, c);
              const isHidden = r < HIDDEN_ROWS;
              
              if (r < HIDDEN_ROWS - 2) return null;

              return (
                <div
                  key={`ball-${r}-${c}`}
                  className={`absolute rounded-full shadow-md transition-all duration-200 ${isHidden ? 'opacity-50 grayscale-[0.5]' : ''}`}
                  style={{
                    width: BALL_RADIUS * 2,
                    height: BALL_RADIUS * 2,
                    left: pos.x - BALL_RADIUS,
                    top: pos.y - BALL_RADIUS,
                    backgroundColor: COLORS[colorIdx],
                    backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4), transparent 70%)',
                    boxShadow: `inset -2px -2px 6px rgba(0,0,0,0.3), 1px 1px 2px rgba(0,0,0,0.5)`,
                    zIndex: isHidden ? 5 : 1 
                  }}
                />
              );
            })
          )}

          {/* Active Piece */}
          {activePiece && gameState === 'PLAYING' && activePiece.balls.map((b, i) => {
            const r = activePiece.y + b.dy;
            const visualX = activePiece.x + b.dx;

            if (r < HIDDEN_ROWS - 2) return null;

            const visibleR = r - HIDDEN_ROWS;
            const xPos = visualX * HEX_WIDTH;
            const yPos = visibleR * ROW_HEIGHT + HEX_HEIGHT / 2;

            return (
               <div
                  key={`active-${i}`}
                  className="absolute rounded-full shadow-xl z-10"
                  style={{
                    width: BALL_RADIUS * 2,
                    height: BALL_RADIUS * 2,
                    left: xPos - BALL_RADIUS,
                    top: yPos - BALL_RADIUS,
                    backgroundColor: COLORS[b.color],
                    backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.8), transparent 70%)',
                    boxShadow: `0 4px 6px rgba(0,0,0,0.3)`
                  }}
                />
            );
          })}
          
          {/* Game Over Overlay */}
          {gameState === 'GAME_OVER' && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 animate-in fade-in">
              <h2 className="text-4xl font-bold text-red-500 mb-4">GAME OVER</h2>
              <p className="text-xl mb-6">Final Score: {score}</p>
              <button onClick={initGame} className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-bold hover:scale-105 transition">
                <RefreshCw size={20} /> Try Again
              </button>
            </div>
          )}

           {gameState === 'START' && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
              <h2 className="text-4xl font-bold text-blue-400 mb-8">Ready?</h2>
              <button onClick={initGame} className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-full font-bold hover:bg-blue-500 transition shadow-lg hover:shadow-blue-500/50">
                <Play size={24} /> Start Game
              </button>
            </div>
          )}

        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-6 w-full md:w-48">
          
          {/* Score Panel */}
          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
            <h3 className="text-gray-400 text-sm uppercase font-bold mb-1">Score</h3>
            <p className="text-3xl font-mono text-green-400">{score}</p>
          </div>

          {/* Next Piece Preview */}
          <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg flex flex-col items-center h-40 justify-center">
             <h3 className="text-gray-400 text-sm uppercase font-bold mb-4 w-full text-left">Next</h3>
             <div className="relative w-24 h-24">
                {/* Visualizing the next triangle (State 0) */}
                {[
                  {x: 40, y: 60, c: nextColors[0]}, // Bottom
                  {x: 20, y: 25, c: nextColors[1]}, // Top Left
                  {x: 60, y: 25, c: nextColors[2]}  // Top Right
                ].map((p, i) => (
                   <div key={i} 
                        className="absolute w-8 h-8 rounded-full border border-black/20"
                        style={{
                          backgroundColor: COLORS[p.c],
                          left: p.x,
                          top: p.y,
                          backgroundImage: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), transparent 70%)'
                        }} 
                   />
                ))}
             </div>
          </div>

           {/* Mobile Controls */}
           <div className="bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg block md:hidden">
              <div className="grid grid-cols-3 gap-2">
                 <button 
                    className="p-4 bg-gray-700 rounded-lg flex justify-center" 
                    onTouchStart={() => keysPressed.current['ArrowLeft'] = true}
                    onTouchEnd={() => keysPressed.current['ArrowLeft'] = false}
                 ><ArrowLeft /></button>
                 <button 
                    className="p-4 bg-gray-700 rounded-lg flex justify-center" 
                    onTouchStart={() => keysPressed.current['ArrowDown'] = true}
                    onTouchEnd={() => keysPressed.current['ArrowDown'] = false}
                 ><ArrowDown /></button>
                 <button 
                    className="p-4 bg-gray-700 rounded-lg flex justify-center" 
                    onTouchStart={() => keysPressed.current['ArrowRight'] = true}
                    onTouchEnd={() => keysPressed.current['ArrowRight'] = false}
                 ><ArrowRight /></button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                  <button className="p-4 bg-blue-700 rounded-lg flex justify-center text-white" onClick={() => rotatePiece('CW')}><RotateCw /></button>
                  <button className="p-4 bg-red-700 rounded-lg flex justify-center text-white font-bold" onClick={hardDrop}>DROP</button>
              </div>
           </div>

           <div className="hidden md:block text-gray-500 text-sm">
             <p className="mb-2 font-bold text-gray-400">How to play:</p>
             <ul className="list-disc pl-4 space-y-1">
               <li><kbd className="bg-gray-700 px-1 rounded">A</kbd> <kbd className="bg-gray-700 px-1 rounded">D</kbd> Move (Hold)</li>
               <li><kbd className="bg-gray-700 px-1 rounded">Q</kbd> <kbd className="bg-gray-700 px-1 rounded">E</kbd> Rotate</li>
               <li><kbd className="bg-gray-700 px-1 rounded">S</kbd> Soft Drop</li>
               <li><kbd className="bg-gray-700 px-1 rounded">W</kbd> Hard Drop</li>
             </ul>
           </div>

        </div>
      </div>
    </div>
  );
}
