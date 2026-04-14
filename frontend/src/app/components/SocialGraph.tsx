// ─────────────────────────────────────────────────────────────────────────────
// Social Graph – Canvas rendering (force-directed layout)
// Węzły = agenci, krawędzie = skumulowane viral paths z wszystkich rund
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface GraphNode {
  id: string;
  name: string;
  opinion: number;
  influenceScore: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
  count: number;
}

interface ViralPath {
  from: string;
  to: string;
}

interface SocialGraphProps {
  population: Array<{ id: string; name: string }>;
  agentOpinions: Record<string, number>;
  viralPathsByRound: ViralPath[][];
}

// ── Layout ────────────────────────────────────────────────────────────────────

function buildLayout(
  population: Array<{ id: string; name: string }>,
  agentOpinions: Record<string, number>,
  viralPathsByRound: ViralPath[][],
  w: number,
  h: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const edgeMap = new Map<string, number>();
  const influenceMap = new Map<string, number>();

  for (const paths of viralPathsByRound) {
    for (const p of paths) {
      if (!p.from || !p.to || p.from === p.to) continue;
      const key = `${p.from}__${p.to}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
      influenceMap.set(p.from, (influenceMap.get(p.from) ?? 0) + 1);
    }
  }

  const maxInfluence = Math.max(1, ...influenceMap.values());

  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) * 0.36;

  const nodes: GraphNode[] = population.map((p, i) => {
    const angle = (2 * Math.PI * i) / population.length - Math.PI / 2;
    const jitter = r * 0.1;
    return {
      id: p.id,
      name: p.name,
      opinion: agentOpinions[p.id] ?? 0,
      influenceScore: (influenceMap.get(p.id) ?? 0) / maxInfluence,
      x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * jitter,
      y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * jitter,
      vx: 0,
      vy: 0,
    };
  });

  const edges: GraphEdge[] = [];
  for (const [key, count] of edgeMap.entries()) {
    const sep = key.indexOf('__');
    if (sep < 0) continue;
    edges.push({ source: key.slice(0, sep), target: key.slice(sep + 2), count });
  }

  // Force simulation
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const PAD = 20;

  for (let iter = 0; iter < 250; iter++) {
    const alpha = Math.pow(0.001, iter / 250);

    // Repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x || 0.1, dy = a.y - b.y || 0.1;
        const d2 = dx * dx + dy * dy + 1;
        const d = Math.sqrt(d2);
        const f = (800 / d2) * alpha;
        a.vx += (dx / d) * f; a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
      }
    }

    // Spring attraction
    for (const e of edges) {
      const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.1;
      const f = (d - 55) * 0.04 * alpha;
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }

    // Center gravity
    for (const n of nodes) {
      n.vx += (cx - n.x) * 0.008 * alpha;
      n.vy += (cy - n.y) * 0.008 * alpha;
      n.vx *= 0.55; n.vy *= 0.55;
      n.x = Math.max(PAD, Math.min(w - PAD, n.x + n.vx));
      n.y = Math.max(PAD, Math.min(h - PAD, n.y + n.vy));
    }
  }

  return { nodes, edges };
}

function nodeColor(opinion: number): string {
  if (opinion > 2)  return '#22c55e';
  if (opinion < -2) return '#ef4444';
  return '#9898a8';
}

// ── Komponent ─────────────────────────────────────────────────────────────────

export function SocialGraph({ population, agentOpinions, viralPathsByRound }: SocialGraphProps) {
  const wrapRef   = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 440 });
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  // Measure container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width || 800;
      setDims({ w, h: Math.max(360, Math.min(500, w * 0.5)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Build graph whenever data or dims change
  useEffect(() => {
    const flat = viralPathsByRound.flat();
    if (!population.length || !flat.length) return;
    const { nodes: n, edges: e } = buildLayout(population, agentOpinions, viralPathsByRound, dims.w, dims.h);
    setNodes(n);
    setEdges(e);
  }, [population, agentOpinions, viralPathsByRound, dims]);

  // Draw on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = dims.w * dpr;
    canvas.height = dims.h * dpr;
    canvas.style.width  = `${dims.w}px`;
    canvas.style.height = `${dims.h}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, dims.w, dims.h);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const maxCount = Math.max(1, ...edges.map(e => e.count));

    // Draw edges
    for (const e of edges) {
      const s = nodeMap.get(e.source);
      const t = nodeMap.get(e.target);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = `rgba(255,255,255,${0.25 + (e.count / maxCount) * 0.45})`;
      ctx.lineWidth = 0.8 + (e.count / maxCount) * 1.5;
      ctx.stroke();
    }

    // Draw nodes
    for (const n of nodes) {
      const r = 4 + n.influenceScore * 9;
      const color = nodeColor(n.opinion);
      const isHov = hovered?.id === n.id;

      // Glow for influencers
      if (n.influenceScore > 0.25) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.fillStyle = color + '30';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, isHov ? r + 2 : r, 0, Math.PI * 2);
      ctx.fillStyle = color + (isHov ? 'ff' : 'cc');
      ctx.fill();

      if (isHov) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [nodes, edges, dims, zoom, pan, hovered]);

  // Mouse move — hit test
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      setPan({
        x: dragRef.current.px + (e.clientX - dragRef.current.sx),
        y: dragRef.current.py + (e.clientY - dragRef.current.sy),
      });
      return;
    }
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const mx = (e.clientX - rect.left - pan.x) / zoom;
    const my = (e.clientY - rect.top  - pan.y) / zoom;
    let found: GraphNode | null = null;
    for (const n of nodes) {
      const r = 4 + n.influenceScore * 9 + 4;
      if ((n.x - mx) ** 2 + (n.y - my) ** 2 < r * r) { found = n; break; }
    }
    setHovered(found);
    setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, [nodes, pan, zoom]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  if (!population.length || !viralPathsByRound.flat().length) return null;

  const positiveCount = nodes.filter(n => n.opinion > 2).length;
  const negativeCount = nodes.filter(n => n.opinion < -2).length;
  const neutralCount  = nodes.length - positiveCount - negativeCount;
  const dominant = positiveCount > negativeCount && positiveCount > neutralCount ? 'positive'
    : negativeCount > positiveCount && negativeCount > neutralCount ? 'negative' : 'neutral';
  const dominantLabel =
    dominant === 'positive' ? `Treść rozprzestrzeniała się głównie wśród agentów pozytywnych (${positiveCount} os.)`
    : dominant === 'negative' ? `Treść wywołała głównie negatywny oddźwięk wśród ${negativeCount} agentów`
    : `Opinie rozłożyły się równomiernie – brak wyraźnej dominacji sentymentu`;

  return (
    <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#38383f]">
        <div>
          <h2 className="text-white font-semibold text-sm">Graf społeczny</h2>
          <p className="text-[#6b6b78] text-xs mt-0.5">
            Każdy węzeł to agent, każda linia — przekazanie treści. Kolor = opinia końcowa, rozmiar = zasięg.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-[#9898a8]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{positiveCount} pozyt.</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{negativeCount} negat.</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#9898a8] inline-block" />{neutralCount} neutr.</span>
            <span className="text-[#52525a]">·</span>
            <span>{edges.length} połączeń</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(z => Math.min(3, z * 1.25))} className="p-1 text-[#9898a8] hover:text-white rounded"><ZoomIn className="w-3.5 h-3.5" /></button>
            <button onClick={() => setZoom(z => Math.max(0.3, z / 1.25))} className="p-1 text-[#9898a8] hover:text-white rounded"><ZoomOut className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="p-1 text-[#9898a8] hover:text-white rounded"><Maximize2 className="w-3.5 h-3.5" /></button>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={wrapRef} className="relative" style={{ height: dims.h }}>
        <canvas
          ref={canvasRef}
          className="cursor-grab active:cursor-grabbing"
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onMouseLeave={() => { dragRef.current = null; setHovered(null); }}
        />

        {/* Tooltip */}
        {hovered && (
          <div
            className="absolute pointer-events-none bg-[#111113] border border-[#38383f] rounded-lg px-3 py-2 shadow-xl z-10"
            style={{ left: Math.min(tooltipPos.x + 12, dims.w - 170), top: Math.max(tooltipPos.y - 48, 4), maxWidth: 164 }}
          >
            <p className="text-white text-xs font-semibold truncate">{hovered.name}</p>
            <p className="text-[#9898a8] text-xs">
              Opinia: <span className={hovered.opinion > 2 ? 'text-green-400' : hovered.opinion < -2 ? 'text-red-400' : 'text-[#9898a8]'}>
                {hovered.opinion > 0 ? '+' : ''}{hovered.opinion.toFixed(1)}
              </span>
            </p>
            {hovered.influenceScore > 0 && (
              <p className="text-[#6b6b78] text-xs">Influence: {Math.round(hovered.influenceScore * 100)}%</p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[#38383f] flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dominant === 'positive' ? 'bg-green-500' : dominant === 'negative' ? 'bg-red-500' : 'bg-[#9898a8]'}`} />
        <p className="text-xs text-[#c0c0cc]">{dominantLabel}</p>
      </div>
    </div>
  );
}
