import { useState } from 'react';

export interface SegmentOpinionStats {
  segment: string;
  label: string;
  count: number;
  avgOpinion: number;
  positiveRatio: number;
  negativeRatio: number;
  neutralRatio: number;
}

export interface PsychoDimension {
  dimension: string;
  segments: SegmentOpinionStats[];
}

export interface DemographicBreakdownData {
  byAgeGroup: SegmentOpinionStats[];
  byGender: SegmentOpinionStats[];
  byEducation: SegmentOpinionStats[];
  byPolitical: SegmentOpinionStats[];
  bySettlement: SegmentOpinionStats[];
  psychographic?: {
    personality: PsychoDimension[];
    values: PsychoDimension[];
    trust: PsychoDimension[];
  };
}

type TabKey = 'byAgeGroup' | 'byGender' | 'byEducation' | 'byPolitical' | 'bySettlement' | 'psychographic';

const DIMS: { key: TabKey; label: string }[] = [
  { key: 'byAgeGroup',     label: 'Wiek' },
  { key: 'byGender',       label: 'Płeć' },
  { key: 'byEducation',    label: 'Wykształcenie' },
  { key: 'byPolitical',    label: 'Polityka' },
  { key: 'bySettlement',   label: 'Miejscowość' },
  { key: 'psychographic',  label: 'Psychografia' },
];

function opinionColor(avg: number): string {
  if (avg > 1.5)  return 'text-emerald-400';
  if (avg > 0)    return 'text-emerald-300';
  if (avg < -1.5) return 'text-red-400';
  if (avg < 0)    return 'text-red-300';
  return 'text-[#c0c0cc]';
}

function SegmentRow({ s }: { s: SegmentOpinionStats }) {
  const posW = Math.round(s.positiveRatio * 100);
  const negW = Math.round(s.negativeRatio * 100);
  const neuW = 100 - posW - negW;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-32 shrink-0 text-sm text-[#c0c0cc] truncate">{s.label}</div>
      <div className="flex-1 flex h-4 rounded overflow-hidden bg-[#1c1c22]">
        {posW > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${posW}%` }} title={`Pozytywni: ${posW}%`} />}
        {neuW > 0 && <div className="bg-[#38383f] h-full"  style={{ width: `${neuW}%` }} title={`Neutralni: ${neuW}%`} />}
        {negW > 0 && <div className="bg-red-500 h-full"    style={{ width: `${negW}%` }} title={`Negatywni: ${negW}%`} />}
      </div>
      <div className={`w-12 text-right text-sm font-mono font-medium shrink-0 ${opinionColor(s.avgOpinion)}`}>
        {s.avgOpinion > 0 ? '+' : ''}{s.avgOpinion.toFixed(1)}
      </div>
      <div className="w-10 text-right text-xs text-[#6b6b7a] shrink-0">{s.count}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-4 mb-3 pb-2 border-b border-[#38383f]">
      <div className="w-32 shrink-0" />
      <div className="flex-1 flex gap-3 text-xs text-[#6b6b7a]">
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />Pozytywni</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-[#38383f]" />Neutralni</span>
        <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-500" />Negatywni</span>
      </div>
      <div className="w-12 text-right text-xs text-[#6b6b7a] shrink-0">Śr.</div>
      <div className="w-10 text-right text-xs text-[#6b6b7a] shrink-0">N</div>
    </div>
  );
}

function FlatPanel({ rows }: { rows: SegmentOpinionStats[] }) {
  return (
    <div>
      <Legend />
      {rows.map((s) => <SegmentRow key={s.segment} s={s} />)}
    </div>
  );
}

function PsychoGroup({ title, dims }: { title: string; dims: PsychoDimension[] }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-[#6366f1] uppercase tracking-wider">{title}</p>
      {dims.map((dim) => (
        <div key={dim.dimension} className="bg-[#1c1c22] rounded-lg p-3 space-y-1">
          <p className="text-xs font-medium text-white mb-2">{dim.dimension}</p>
          {dim.segments.map((s) => <SegmentRow key={s.segment} s={s} />)}
        </div>
      ))}
    </div>
  );
}

function PsychoPanel({ data }: { data: NonNullable<DemographicBreakdownData['psychographic']> }) {
  return (
    <div className="space-y-5">
      <Legend />
      <PsychoGroup title="Osobowość (OCEAN)" dims={data.personality} />
      <PsychoGroup title="Wartości i postawy" dims={data.values} />
      <PsychoGroup title="Zaufanie" dims={data.trust} />
    </div>
  );
}

interface Props {
  data: DemographicBreakdownData;
}

export function DemographicBreakdown({ data }: Props) {
  const [active, setActive] = useState<TabKey>('byAgeGroup');

  return (
    <div className="bg-[#16161a] border border-[#38383f] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-white mb-4">Breakdown demograficzny i psychograficzny</h3>

      <div className="flex gap-1 mb-5 flex-wrap">
        {DIMS.map((d) => (
          <button
            key={d.key}
            onClick={() => setActive(d.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              active === d.key
                ? 'bg-[#6366f1] text-white'
                : 'text-[#c0c0cc] hover:text-white hover:bg-[#38383f]'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      {active === 'psychographic'
        ? data.psychographic
          ? <PsychoPanel data={data.psychographic} />
          : <p className="text-sm text-[#6b6b7a]">Brak danych psychograficznych.</p>
        : <FlatPanel rows={data[active] as SegmentOpinionStats[]} />
      }
    </div>
  );
}
