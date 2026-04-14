// ─────────────────────────────────────────────────────────────────────────────
// Social Graph – force-directed SVG visualization
// Węzły = agenci, krawędzie = skumulowane viral paths z wszystkich rund
// Kolorowanie wg końcowej opinii, rozmiar wg influence score
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface GraphNode {
  id: string;
  name: string;
  opinion: number;        // -10 to +10
  influenceScore: number; // liczba razy jako źródło spreadu
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface GraphEdge {
  source: string;
  target: string;
  count: number; // ile razy ta ścieżka wystąpiła
}

interface ViralPath {
  from: string;
  fromName: string;
  to: string;
  toName: string;
}

interface SocialGraphProps {
  population: Array<{ id: string; name: string }>;
  agentOpinions: Record<string, number>;
  viralPathsByRound: ViralPath[][];
}

// ── Force simulation (pure JS, no d3) ────────────────────────────────────────

function buildGraph(
  population: Array<{ id: string; name: string }>,
  agentOpinions: Record<string, number>,
  viralPathsByRound: ViralPath[][],
  width: number,
  height: number,
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  // Zlicz krawędzie i influence scores
  const edgeMap = new Map<string, number>();
  const influenceMap = new Map<string, number>();

  for (const paths of viralPathsByRound) {
    for (const p of paths) {
      const key = `${p.from}→${p.to}`;
      edgeMap.set(key, (edgeMap.get(key) ?? 0) + 1);
      influenceMap.set(p.from, (influenceMap.get(p.from) ?? 0) + 1);
    }
  }

  const maxInfluence = Math.max(1, ...influenceMap.values());

  // Rozmieszczenie kołowe na start
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.38;

  const nodes: GraphNode[] = population.map((p, i) => {
    const angle = (2 * Math.PI * i) / population.length;
    // Drobny szum żeby uniknąć perfekcyjnego okręgu
    const jitter = r * 0.15;
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
    const [source, target] = key.split('→');
    edges.push({ source, target, count });
  }

  return { nodes, edges };
}

function runSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  width: number,
  height: number,
  iterations = 200,
): GraphNode[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const alpha = { current: 1.0 };
  const alphaDecay = 1 - Math.pow(0.001, 1 / iterations);

  for (let iter = 0; iter < iterations; iter++) {
    const a = alpha.current;

    // Odpychanie między węzłami
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const ni = nodes[i], nj = nodes[j];
        const dx = ni.x - nj.x;
        const dy = ni.y - nj.y;
        const dist2 = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(dist2);
        const repulsion = 900 / dist2;
        const fx = (dx / dist) * repulsion * a;
        const fy = (dy / dist) * repulsion * a;
        ni.vx += fx; ni.vy += fy;
        nj.vx -= fx; nj.vy -= fy;
      }
    }

    // Przyciąganie krawędzi (spring)
    const targetDist = 60;
    for (const e of edges) {
      const ns = nodeMap.get(e.source), nt = nodeMap.get(e.target);
      if (!ns || !nt) continue;
      const dx = nt.x - ns.x;
      const dy = nt.y - ns.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const force = (dist - targetDist) * 0.05 * a;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      ns.vx += fx; ns.vy += fy;
      nt.vx -= fx; nt.vy -= fy;
    }

    // Grawitacja do centrum
    const cx = width / 2, cy = height / 2;
    for (const n of nodes) {
      n.vx += (cx - n.x) * 0.01 * a;
      n.vy += (cy - n.y) * 0.01 * a;
    }

    // Zastosuj prędkości z tłumieniem
    const damping = 0.6;
    for (const n of nodes) {
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
      // Trzymaj w granicach
      const pad = 24;
      n.x = Math.max(pad, Math.min(width - pad, n.x));
      n.y = Math.max(pad, Math.min(height - pad, n.y));
    }

    alpha.current -= alpha.current * alphaDecay;
  }

  return nodes;
}

// ── Kolory ────────────────────────────────────────────────────────────────────

function opinionColor(opinion: number): string {
  if (opinion > 2)  return '#22c55e'; // zielony
  if (opinion < -2) return '#ef4444'; // czerwony
  return '#71717a';                   // szary
}

function opinionColorFaint(opinion: number): string {
  if (opinion > 2)  return '#22c55e40';
  if (opinion < -2) return '#ef444440';
  return '#71717a30';
}

// ── Komponent ─────────────────────────────────────────────────────────────────

export function SocialGraph({ population, agentOpinions, viralPathsByRound }: SocialGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 420 });
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [hovered, setHovered] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Zmierz kontener
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      setDims({ w: width, h: Math.max(360, Math.min(520, width * 0.55)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Buduj i symuluj graf
  useEffect(() => {
    if (!population.length || !viralPathsByRound.length) return;
    const { nodes: rawNodes, edges: rawEdges } = buildGraph(
      population, agentOpinions, viralPathsByRound, dims.w, dims.h
    );
    const simulated = runSimulation(rawNodes, rawEdges, dims.w, dims.h, 220);
    setNodes([...simulated]);
    setEdges(rawEdges);
  }, [population, agentOpinions, viralPathsByRound, dims]);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const maxCount = Math.max(1, ...edges.map(e => e.count));

  // Pan handlers
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as SVGElement).closest('[data-node]')) return;
    dragging.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    setPan({
      x: dragging.current.panX + (e.clientX - dragging.current.startX),
      y: dragging.current.panY + (e.clientY - dragging.current.startY),
    });
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = null; }, []);

  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  if (!population.length || !viralPathsByRound.flat().length) return null;

  const totalEdges = viralPathsByRound.flat().length;
  const positiveCount = nodes.filter(n => n.opinion > 2).length;
  const negativeCount = nodes.filter(n => n.opinion < -2).length;
  const neutralCount = nodes.length - positiveCount - negativeCount;

  // Dominujący sentyment → komentarz
  const dominant =
    positiveCount > negativeCount && positiveCount > neutralCount ? 'positive' :
    negativeCount > positiveCount && negativeCount > neutralCount ? 'negative' : 'neutral';
  const dominantLabel =
    dominant === 'positive' ? `Treść rozprzestrzeniała się głównie wśród agentów pozytywnych (${positiveCount} os.)` :
    dominant === 'negative' ? `Treść wywołała głównie negatywny oddźwięk wśród ${negativeCount} agentów` :
    `Opinie rozłożyły się równomiernie – brak wyraźnej dominacji sentymentu`;

  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
      {/* Nagłówek */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#27272a]">
        <div>
          <h2 className="text-white font-semibold text-sm">Graf społeczny</h2>
          <p className="text-[#52525b] text-xs mt-0.5">
            Każdy węzeł to agent, każda linia — przekazanie treści. Kolor = opinia końcowa, rozmiar = zasięg.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Legenda */}
          <div className="flex items-center gap-3 text-xs text-[#71717a]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{positiveCount} pozyt.</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{negativeCount} negat.</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#71717a] inline-block" />{neutralCount} neutr.</span>
            <span className="text-[#3f3f46]">·</span>
            <span>{totalEdges} przekazań</span>
          </div>
          {/* Kontrolki zoom */}
          <div className="flex items-center gap-1">
            <button onClick={() => setZoom(z => Math.min(3, z * 1.25))} className="p-1 text-[#71717a] hover:text-white rounded">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setZoom(z => Math.max(0.3, z / 1.25))} className="p-1 text-[#71717a] hover:text-white rounded">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button onClick={resetView} className="p-1 text-[#71717a] hover:text-white rounded">
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* SVG */}
      <div ref={containerRef} className="relative" style={{ height: dims.h }}>
        <svg
          width={dims.w}
          height={dims.h}
          className="cursor-grab active:cursor-grabbing select-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`} style={{ transformOrigin: `${dims.w / 2}px ${dims.h / 2}px` }}>
            {/* Krawędzie */}
            {edges.map((e, i) => {
              const s = nodeMap.get(e.source), t = nodeMap.get(e.target);
              if (!s || !t) return null;
              const opacity = 0.5 + (e.count / maxCount) * 0.4;
              const strokeW = 1.2 + (e.count / maxCount) * 2.0;
              return (
                <line
                  key={i}
                  x1={s.x} y1={s.y} x2={t.x} y2={t.y}
                  stroke="#ffffff"
                  strokeWidth={strokeW}
                  strokeOpacity={opacity}
                />
              );
            })}

            {/* Węzły */}
            {nodes.map(n => {
              const r = 4 + n.influenceScore * 8;
              const isHov = hovered?.id === n.id;
              return (
                <g
                  key={n.id}
                  data-node="1"
                  transform={`translate(${n.x},${n.y})`}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Aura dla influencerów */}
                  {n.influenceScore > 0.3 && (
                    <circle r={r + 5} fill={opinionColorFaint(n.opinion)} />
                  )}
                  <circle
                    r={isHov ? r + 2 : r}
                    fill={opinionColor(n.opinion)}
                    fillOpacity={isHov ? 1 : 0.85}
                    stroke={isHov ? '#fff' : opinionColor(n.opinion)}
                    strokeWidth={isHov ? 1.5 : 0.5}
                    strokeOpacity={0.6}
                    style={{ transition: 'r 0.1s' }}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {/* Tooltip */}
        {hovered && (() => {
          const s = nodeMap.get(hovered.id);
          if (!s) return null;
          // Przelicz pozycję ekranową
          const tx = s.x * zoom + pan.x;
          const ty = s.y * zoom + pan.y;
          const left = Math.min(tx + 10, dims.w - 180);
          const top = Math.max(ty - 50, 4);
          return (
            <div
              className="absolute pointer-events-none bg-[#09090b] border border-[#27272a] rounded-lg px-3 py-2 shadow-xl z-10"
              style={{ left, top, maxWidth: 172 }}
            >
              <p className="text-white text-xs font-semibold truncate">{hovered.name}</p>
              <p className="text-[#71717a] text-xs">
                Opinia: <span className={hovered.opinion > 2 ? 'text-green-400' : hovered.opinion < -2 ? 'text-red-400' : 'text-[#71717a]'}>
                  {hovered.opinion > 0 ? '+' : ''}{hovered.opinion.toFixed(1)}
                </span>
              </p>
              {hovered.influenceScore > 0 && (
                <p className="text-[#52525b] text-xs">Influence: {Math.round(hovered.influenceScore * 100)}%</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Komentarz */}
      <div className="px-5 py-3 border-t border-[#27272a] flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dominant === 'positive' ? 'bg-green-500' : dominant === 'negative' ? 'bg-red-500' : 'bg-[#71717a]'}`} />
        <p className="text-xs text-[#a1a1aa]">{dominantLabel}</p>
      </div>
    </div>
  );
}
