/* Hình khối isometric vẽ bằng SVG — theo design.md: voxel, đảo nổi, tiến độ = xây dựng. */

interface Palette {
  top: string;
  left: string;
  right: string;
}

const P: Record<string, Palette> = {
  grass: { top: '#7BCB7F', left: '#8D6E63', right: '#6D4C41' },
  dirt: { top: '#8D6E63', left: '#795548', right: '#5D4037' },
  blue: { top: '#6FA6FF', left: '#448AFF', right: '#2F6FE0' },
  mint: { top: '#9BF6CA', left: '#69F0AE', right: '#45CF8D' },
  lava: { top: '#FF9272', left: '#FF7043', right: '#E2562B' },
  ghost: { top: '#E3ECFB', left: '#D3DFF5', right: '#C3D2EE' },
  cloud: { top: '#FFFFFF', left: '#EEF3FD', right: '#DDE7FA' },
};

interface Block {
  x: number;
  y: number;
  z: number;
  color: keyof typeof P;
  opacity?: number;
  fresh?: boolean;
}

const S = 22; // nửa chiều rộng mặt trên
const H = 22; // chiều cao khối

function project(x: number, y: number, z: number): [number, number] {
  return [(x - y) * S, ((x + y) * S) / 2 - z * H];
}

function Cube({ b, h = H }: { b: Block; h?: number }) {
  const [cx, cy] = project(b.x, b.y, b.z);
  const p = P[b.color];
  const top = `${cx},${cy - S / 2} ${cx + S},${cy} ${cx},${cy + S / 2} ${cx - S},${cy}`;
  const left = `${cx - S},${cy} ${cx},${cy + S / 2} ${cx},${cy + S / 2 + h} ${cx - S},${cy + h}`;
  const right = `${cx + S},${cy} ${cx},${cy + S / 2} ${cx},${cy + S / 2 + h} ${cx + S},${cy + h}`;
  return (
    <g opacity={b.opacity ?? 1} className={b.fresh ? 'block-new' : undefined}>
      <polygon points={left} fill={p.left} />
      <polygon points={right} fill={p.right} />
      <polygon points={top} fill={p.top} />
      <polyline points={`${cx - S},${cy} ${cx},${cy + S / 2} ${cx + S},${cy}`} fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" />
    </g>
  );
}

function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => a.z - b.z || a.x + a.y - (b.x + b.y));
}

const BUILD_COLORS: (keyof typeof P)[] = ['blue', 'mint', 'lava'];

/** Vị trí xây: 9 ô mỗi tầng, tối đa 3 tầng. */
function buildSlots(total: number): { x: number; y: number; z: number }[] {
  const order = [
    [1, 1],
    [0, 1],
    [1, 0],
    [2, 1],
    [1, 2],
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ];
  const slots: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < Math.min(total, 27); i++) {
    const [x, y] = order[i % 9];
    slots.push({ x: x + 0.5, y: y + 0.5, z: 1 + Math.floor(i / 9) });
  }
  return slots;
}

/**
 * Đảo nổi: mỗi việc xong là một khối được đặt lên đảo.
 * `done`/`total` = số việc xong / số việc của tuần.
 */
export function ProgressIsland({ done, total }: { done: number; total: number }) {
  const base: Block[] = [];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) base.push({ x, y, z: 0, color: 'grass' });
  const under: Block[] = [
    { x: 1, y: 1, z: -1, color: 'dirt' },
    { x: 2, y: 1, z: -1, color: 'dirt' },
    { x: 1, y: 2, z: -1, color: 'dirt' },
    { x: 2, y: 2, z: -1, color: 'dirt' },
    { x: 1.5, y: 1.5, z: -2, color: 'dirt' },
  ];
  const slots = buildSlots(total);
  const built: Block[] = slots.map((s, i) =>
    i < done
      ? { ...s, color: BUILD_COLORS[i % BUILD_COLORS.length], fresh: i === done - 1 }
      : { ...s, color: 'ghost', opacity: 0.55 },
  );
  // Khối chưa xây ở tầng trên không che khối đã xây: chỉ vẽ khối "ma" của tầng đang xây.
  const currentLayer = 1 + Math.floor(Math.max(done - 1, 0) / 9);
  const visible = built.filter((b, i) => i < done || b.z <= currentLayer);

  return (
    <svg className="island" viewBox="-110 -96 220 236" role="img" aria-label={`Đã xây ${done} trên ${total} khối: mỗi việc xong là một khối.`}>
      <ellipse className="ground-shadow" cx="0" cy="126" rx="62" ry="9" fill="#3E2723" opacity="0.2" />
      <g className="floaty">
        <g transform="translate(-78 -70) scale(0.42)">
          <Cube b={{ x: 0, y: 0, z: 0, color: 'cloud' }} h={12} />
          <Cube b={{ x: 1, y: 0, z: 0, color: 'cloud' }} h={12} />
        </g>
        <g transform="translate(74 -40) scale(0.34)">
          <Cube b={{ x: 0, y: 0, z: 0, color: 'cloud' }} h={12} />
          <Cube b={{ x: 0, y: 1, z: 0, color: 'cloud' }} h={12} />
        </g>
        <g transform="translate(0 -22)">
          {sortBlocks(under).map((b, i) => (
            <Cube key={`u${i}`} b={b} />
          ))}
          {sortBlocks(base).map((b, i) => (
            <Cube key={`b${i}`} b={b} h={H} />
          ))}
          {sortBlocks(visible).map((b) => (
            <Cube key={`t${b.x}-${b.y}-${b.z}`} b={b} />
          ))}
        </g>
      </g>
    </svg>
  );
}

/** Một khối đơn — dùng cho trạng thái trống và logo. */
export function CubeIcon({ color = 'blue', size = 28 }: { color?: keyof typeof P; size?: number }) {
  return (
    <svg className="cube" width={size} height={size * 1.1} viewBox="-24 -14 48 58" aria-hidden>
      <Cube b={{ x: 0, y: 0, z: 0, color }} />
    </svg>
  );
}

/** Cụm khối nhỏ cho trạng thái trống. */
export function EmptyBlocks() {
  const blocks: Block[] = [
    { x: 0, y: 0, z: 0, color: 'grass' },
    { x: 1, y: 0, z: 0, color: 'grass' },
    { x: 0, y: 1, z: 0, color: 'grass' },
    { x: 1, y: 1, z: 0, color: 'grass' },
    { x: 0.5, y: 0.5, z: 1, color: 'ghost', opacity: 0.7 },
  ];
  return (
    <svg className="cube" viewBox="-50 -40 100 100" aria-hidden>
      {sortBlocks(blocks).map((b, i) => (
        <Cube key={i} b={b} />
      ))}
    </svg>
  );
}
