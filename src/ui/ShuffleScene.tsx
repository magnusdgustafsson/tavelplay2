// "Dela lag" animation: a pile of floorball sticks in the middle, a player
// picks them up one by one and throws every other one to the left and to
// the right team. Drawn as SVG and styled per theme via CSS variables.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const STICKS = 10;
const START = 250; // ms before the first pick-up
const CYCLE = 210; // ms per stick (pick up + throw)
const RELEASE_AT = 0.72; // part of the cycle when the stick leaves the hand
const FLIGHT = 420; // ms in the air
/** When the last stick has landed. */
export const SCENE_MS = START + (STICKS - 1) * CYCLE + RELEASE_AT * CYCLE + FLIGHT + 120;

const STICK_COLORS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#f5f5f5', '#212121', '#fb8c00', '#8e24aa', '#00acc1', '#d81b60'];
const BLADE_COLORS = ['#f5f5f5', '#212121'];

// Deterministic "random" so the scene looks the same every render.
const rand = (i: number, salt: number) => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const rad = (deg: number) => (deg * Math.PI) / 180;

function Stick({ x, y, angle, len, i }: { x: number; y: number; angle: number; len: number; i: number }) {
  // Drawn pointing to the right from its centre; blade at the right end.
  const w = Math.max(4, len * 0.05);
  const half = len / 2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <line x1={-half} y1={0} x2={half} y2={0} stroke="var(--ss-stick-outline)" strokeWidth={w + 3} strokeLinecap="round" />
      <line x1={-half} y1={0} x2={half} y2={0} stroke={STICK_COLORS[i % STICK_COLORS.length]} strokeWidth={w} strokeLinecap="round" />
      <line x1={-half} y1={0} x2={-half + len * 0.22} y2={0} stroke="var(--ss-grip)" strokeWidth={w * 1.15} strokeLinecap="round" />
      <path
        d={`M ${half - w * 0.6} ${-w * 0.6} q ${len * 0.08} ${len * 0.02} ${len * 0.19} ${len * 0.075} q ${w * 0.6} ${w * 1.2} ${-w * 0.4} ${w * 2.4} q ${-len * 0.1} ${-len * 0.03} ${-len * 0.2} ${-len * 0.02} z`}
        fill={BLADE_COLORS[i % 2]}
        stroke="var(--ss-stick-outline)"
        strokeWidth={Math.max(1.5, w * 0.35)}
        strokeLinejoin="round"
      />
    </g>
  );
}

export function ShuffleScene({ fading }: { fading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [t, setT] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      setT(elapsed);
      if (elapsed < SCENE_MS + 600) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!size) return <div ref={ref} className="shuffle-scene" />;
  const { w: W, h: H } = size;

  // ---- Geometry ----
  const unit = Math.min(W / 2.2, H);
  const figH = unit * 0.62; // head to feet
  const cx = W / 2;
  const feetY = H * 0.88;
  const stickLen = Math.min(W * 0.2, unit * 0.4);
  const pileY = feetY + figH * 0.02;
  const landY = H * 0.42;
  const landX = { left: W * 0.25, right: W * 0.75 };

  // ---- Which throw is happening ----
  const local = t - START;
  const k = Math.floor(local / CYCLE); // stick index being handled (0..9)
  const u = local < 0 ? 0 : k >= STICKS ? 1 : (local - k * CYCLE) / CYCLE;
  const dirOf = (i: number) => (i % 2 === 0 ? -1 : 1); // -1 = left, 1 = right
  const throwAngle = (i: number) => (dirOf(i) < 0 ? 205 : -25); // arm angle at release
  const DOWN = 90;

  // Throwing arm angle (screen degrees, 0 = right, 90 = down).
  let arm = DOWN + 40;
  let crouch = 0;
  let lean = 0;
  if (local >= 0 && k < STICKS) {
    const prev = k === 0 ? DOWN + 40 : throwAngle(k - 1);
    const target = throwAngle(k);
    if (u < 0.5) {
      const p = easeInOut(u / 0.5);
      arm = lerp(prev, DOWN, p);
      crouch = Math.sin(p * Math.PI * 0.5);
    } else {
      // Angles crossing 90 → 205 go via 150 (left side); 90 → -25 via 30 (right side).
      const p = easeOut(clamp01((u - 0.5) / (RELEASE_AT - 0.5)));
      arm = lerp(DOWN, target, p);
      crouch = 1 - p;
      lean = dirOf(k) * 9 * p;
    }
  } else if (k >= STICKS) {
    const p = clamp01((local - STICKS * CYCLE) / 300);
    arm = lerp(throwAngle(STICKS - 1), DOWN + 40, easeInOut(p));
    lean = dirOf(STICKS - 1) * 9 * (1 - p);
  }

  const hipY = feetY - figH * 0.42 + crouch * figH * 0.1;
  const torsoLen = figH * 0.33;
  const neck = {
    x: cx + Math.sin(rad(lean)) * torsoLen,
    y: hipY - Math.cos(rad(lean)) * torsoLen + crouch * figH * 0.06,
  };
  const headR = figH * 0.095;
  const head = { x: neck.x + Math.sin(rad(lean)) * headR * 1.3, y: neck.y - headR * 1.25 };
  const shoulder = { x: lerp(cx, neck.x, 0.85), y: lerp(hipY, neck.y, 0.85) };
  const armLen = figH * 0.34;
  const hand = { x: shoulder.x + Math.cos(rad(arm)) * armLen, y: shoulder.y + Math.sin(rad(arm)) * armLen };
  const otherArm = 180 - (DOWN + 25) + lean;
  const otherHand = {
    x: shoulder.x + Math.cos(rad(otherArm)) * armLen * 0.9,
    y: shoulder.y + Math.sin(rad(otherArm)) * armLen * 0.9,
  };
  const knee = figH * 0.21;
  const legSpread = figH * 0.16 + crouch * figH * 0.05;

  // ---- Sticks ----
  const sticks = Array.from({ length: STICKS }, (_, i) => {
    const pileAngle = (rand(i, 1) - 0.5) * 70;
    const pileX = cx + (rand(i, 2) - 0.5) * stickLen * 0.5;
    const pileYi = pileY - (i % 4) * 3;
    const side = dirOf(i) < 0 ? 'left' : 'right';
    const order = Math.floor(i / 2); // 0..4 on each side
    const tgt = {
      x: landX[side] + (rand(i, 3) - 0.5) * stickLen * 0.5,
      y: landY + (order - 2) * stickLen * 0.12 + (rand(i, 4) - 0.5) * 8,
      angle: (rand(i, 5) - 0.5) * 50 + (side === 'left' ? 180 : 0),
    };
    const pick = START + i * CYCLE + 0.42 * CYCLE;
    const release = START + i * CYCLE + RELEASE_AT * CYCLE;
    if (t < pick) return { i, x: pileX, y: pileYi, angle: pileAngle, z: 0 };
    if (t < release) {
      // In the hand: held at the grip, pointing along the arm.
      return {
        i,
        x: hand.x + Math.cos(rad(arm)) * stickLen * 0.38,
        y: hand.y + Math.sin(rad(arm)) * stickLen * 0.38,
        angle: arm,
        z: 2,
      };
    }
    const s = clamp01((t - release) / FLIGHT);
    const from = {
      x: shoulder.x + Math.cos(rad(throwAngle(i))) * (armLen + stickLen * 0.38),
      y: shoulder.y + Math.sin(rad(throwAngle(i))) * (armLen + stickLen * 0.38),
    };
    const arc = H * 0.32;
    const spin = 360 * (1 + (i % 3 === 0 ? 1 : 0)) * dirOf(i);
    return {
      i,
      x: lerp(from.x, tgt.x, s),
      y: lerp(from.y, tgt.y, s) - arc * 4 * s * (1 - s),
      angle: lerp(throwAngle(i), tgt.angle + spin, easeOut(s)),
      z: s >= 1 ? 1 : 3,
    };
  });

  const pile = sticks.filter((s) => s.z === 0);
  const flying = sticks.filter((s) => s.z !== 0).sort((a, b) => a.z - b.z);
  const stroke = Math.max(4, figH * 0.055);

  return (
    <div ref={ref} className={`shuffle-scene${fading ? ' fading' : ''}`} aria-hidden="true">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* Player (behind the pile) */}
        <g className="ss-figure" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <line x1={cx} y1={hipY} x2={cx - legSpread * 0.55} y2={hipY + knee} stroke="var(--ss-pants)" strokeWidth={stroke * 1.25} />
          <line x1={cx - legSpread * 0.55} y1={hipY + knee} x2={cx - legSpread} y2={feetY} stroke="var(--ss-skin)" strokeWidth={stroke} />
          <line x1={cx} y1={hipY} x2={cx + legSpread * 0.55} y2={hipY + knee} stroke="var(--ss-pants)" strokeWidth={stroke * 1.25} />
          <line x1={cx + legSpread * 0.55} y1={hipY + knee} x2={cx + legSpread} y2={feetY} stroke="var(--ss-skin)" strokeWidth={stroke} />
          <line x1={cx - legSpread - stroke} y1={feetY} x2={cx - legSpread + stroke * 0.6} y2={feetY} stroke="var(--ss-shoe)" strokeWidth={stroke * 1.2} />
          <line x1={cx + legSpread - stroke * 0.6} y1={feetY} x2={cx + legSpread + stroke} y2={feetY} stroke="var(--ss-shoe)" strokeWidth={stroke * 1.2} />
          <line x1={shoulder.x} y1={shoulder.y} x2={otherHand.x} y2={otherHand.y} stroke="var(--ss-skin)" strokeWidth={stroke} />
          {/* Jersey */}
          <line x1={cx} y1={hipY} x2={neck.x} y2={neck.y} stroke="var(--ss-shirt)" strokeWidth={stroke * 3.2} />
          <line x1={shoulder.x} y1={shoulder.y} x2={hand.x} y2={hand.y} stroke="var(--ss-skin)" strokeWidth={stroke} />
          <line
            x1={shoulder.x}
            y1={shoulder.y}
            x2={lerp(shoulder.x, hand.x, 0.35)}
            y2={lerp(shoulder.y, hand.y, 0.35)}
            stroke="var(--ss-shirt)"
            strokeWidth={stroke * 1.6}
          />
          <circle cx={head.x} cy={head.y} r={headR} fill="var(--ss-skin)" stroke="var(--ss-outline)" strokeWidth={stroke * 0.35} />
          <circle cx={head.x - headR * 0.32 + lean * 0.02 * headR} cy={head.y + headR * 0.12} r={headR * 0.13} fill="var(--ss-outline)" />
          <circle cx={head.x + headR * 0.32 + lean * 0.02 * headR} cy={head.y + headR * 0.12} r={headR * 0.13} fill="var(--ss-outline)" />
          {/* Cap */}
          <path
            d={`M ${head.x - headR} ${head.y - headR * 0.15} A ${headR} ${headR} 0 0 1 ${head.x + headR} ${head.y - headR * 0.15} L ${head.x + headR * 1.55} ${head.y - headR * 0.05} Z`}
            fill="var(--ss-shirt)"
            stroke="var(--ss-outline)"
            strokeWidth={stroke * 0.3}
          />
        </g>
        {/* Pile in front of the player, then sticks in the air / landed */}
        {pile.map((s) => (
          <Stick key={s.i} {...s} len={stickLen} />
        ))}
        {flying.map((s) => (
          <Stick key={s.i} {...s} len={stickLen} />
        ))}
      </svg>
    </div>
  );
}
