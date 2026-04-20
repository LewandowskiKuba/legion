// ─────────────────────────────────────────────────────────────────────────────
// FrameCompetitionChart – adopcja framingów per runda + breakdown per segment
// ─────────────────────────────────────────────────────────────────────────────

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Legend, Cell,
} from 'recharts';
import { useState } from 'react';

interface Frame { id: string; label: string; }
interface FrameSegmentStats { segment: string; frameShares: Record<string, number>; }
interface FrameRoundStats {
  roundNumber: number;
  frameAdoption: Record<string, number>;
  frameShare: Record<string, number>;
  byAgeGroup: FrameSegmentStats[];
  byPolitical: FrameSegmentStats[];
}

interface Props {
  frames: Frame[];
  frameStats: FrameRoundStats[];
}

// Paleta kolorów framingów (do 6 framingów)
const FRAME_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

type SegmentDim = 'age' | 'political';

export function FrameCompetitionChart({ frames, frameStats }: Props) {
  const [segDim, setSegDim] = useState<SegmentDim>('age');

  if (!frames.length || !frameStats.length) return null;

  const frameColor = (id: string) => {
    const idx = frames.findIndex(f => f.id === id);
    return FRAME_COLORS[idx % FRAME_COLORS.length];
  };

  // Dane do wykresu liniowego (adopcja per runda, w %)
  const lineData = frameStats.map(s => {
    const row: Record<string, any> = { round: `R${s.roundNumber}` };
    for (const f of frames) {
      row[f.label] = Math.round((s.frameShare[f.id] ?? 0) * 100);
    }
    return row;
  });

  // Dane do wykresu segmentowego
  const segStats = frameStats[frameStats.length - 1];
  const segData = (segDim === 'age' ? segStats.byAgeGroup : segStats.byPolitical) ?? [];
  const barData = segData.map(seg => {
    const row: Record<string, any> = { segment: seg.segment };
    for (const f of frames) {
      row[f.label] = Math.round((seg.frameShares[f.id] ?? 0) * 100);
    }
    return row;
  });

  const winner = frames.reduce((best, f) => {
    const share = segStats.frameShare[f.id] ?? 0;
    return share > (segStats.frameShare[best.id] ?? 0) ? f : best;
  }, frames[0]);

  return (
    <div className="space-y-5">
      {/* Adopcja per runda */}
      <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#38383f]">
          <h2 className="text-white font-semibold text-sm">Adopcja framingów w czasie</h2>
          <p className="text-[#6b6b78] text-xs mt-0.5">Udział agentów adoptujących dany framing per runda (%)</p>
        </div>
        <div className="p-4">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={lineData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a32" />
              <XAxis dataKey="round" tick={{ fill: '#6b6b78', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b6b78', fontSize: 11 }} unit="%" domain={[0, 100]} />
              <Tooltip
                contentStyle={{ background: '#111113', border: '1px solid #38383f', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#c0c0cc' }}
                formatter={(val: any) => [`${val}%`]}
              />
              {frames.map(f => (
                <Area
                  key={f.id}
                  type="monotone"
                  dataKey={f.label}
                  stroke={frameColor(f.id)}
                  fill={frameColor(f.id) + '20'}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {/* Legenda + winner */}
        <div className="px-5 py-3 border-t border-[#38383f] flex items-center gap-4 flex-wrap">
          {frames.map(f => (
            <span key={f.id} className="flex items-center gap-1.5 text-xs text-[#c0c0cc]">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: frameColor(f.id) }} />
              {f.label} — {Math.round((segStats.frameShare[f.id] ?? 0) * 100)}%
            </span>
          ))}
          <span className="ml-auto text-xs text-[#6b6b78]">
            Dominujący: <span className="text-white">{winner.label}</span>
          </span>
        </div>
      </div>

      {/* Breakdown per segment */}
      <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#38383f] flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-sm">Adopcja per segment (ostatnia runda)</h2>
            <p className="text-[#6b6b78] text-xs mt-0.5">Który framing dominuje w każdej grupie</p>
          </div>
          <div className="flex rounded-lg border border-[#38383f] overflow-hidden text-xs">
            {(['age', 'political'] as SegmentDim[]).map(dim => (
              <button
                key={dim}
                onClick={() => setSegDim(dim)}
                className={`px-3 py-1.5 transition-colors ${segDim === dim ? 'bg-[#38383f] text-white' : 'text-[#6b6b78] hover:text-white'}`}
              >
                {dim === 'age' ? 'Wiek' : 'Polityka'}
              </button>
            ))}
          </div>
        </div>
        <div className="p-4">
          {barData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 16, left: 60, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a32" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b6b78', fontSize: 11 }} unit="%" domain={[0, 100]} />
                <YAxis type="category" dataKey="segment" tick={{ fill: '#9898a8', fontSize: 11 }} width={56} />
                <Tooltip
                  contentStyle={{ background: '#111113', border: '1px solid #38383f', borderRadius: 8, fontSize: 12 }}
                  formatter={(val: any) => [`${val}%`]}
                />
                {frames.map(f => (
                  <Bar key={f.id} dataKey={f.label} stackId="a" fill={frameColor(f.id)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-[#6b6b78] text-xs text-center py-8">Brak danych segmentowych</p>
          )}
        </div>
      </div>
    </div>
  );
}
