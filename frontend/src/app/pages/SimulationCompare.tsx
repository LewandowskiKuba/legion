import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, ExternalLink, Loader2, BarChart3 } from 'lucide-react';
import { getSimulation } from '../utils/api';

// ─── Typy lokalne ─────────────────────────────────────────────────────────────

interface OpinionDist {
  positive: number;
  negative: number;
  neutral: number;
}

interface SimData {
  id: string;
  studyName?: string;
  status?: string;
  finalOpinionDistribution?: OpinionDist;
  reportAgentSynthesis?: string;
  recommendations?: string[];
}

// ─── Helpery ──────────────────────────────────────────────────────────────────

function getOpinionDist(state: any): OpinionDist | null {
  const dist = state?.finalOpinionDistribution ?? state?.opinionDistribution;
  if (!dist) return null;
  return {
    positive: dist.positive ?? 0,
    negative: dist.negative ?? 0,
    neutral: dist.neutral ?? dist.neutral ?? 0,
  };
}

function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'completed': return 'text-green-400';
    case 'running': return 'text-yellow-400';
    case 'error': return 'text-red-400';
    default: return 'text-[#a1a1aa]';
  }
}

function getStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'completed': return 'Zakończona';
    case 'running': return 'W trakcie';
    case 'error': return 'Błąd';
    default: return status ?? 'Nieznany';
  }
}

// ─── ProgressBar ─────────────────────────────────────────────────────────────

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[#a1a1aa]">
        <span>{label}</span>
        <span className="text-white font-semibold">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.round(value * 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── SimColumn ────────────────────────────────────────────────────────────────

function SimColumn({
  label,
  accentColor,
  data,
  loading,
  error,
  onOpen,
}: {
  label: string;
  accentColor: string;
  data: SimData | null;
  loading: boolean;
  error: string | null;
  onOpen: () => void;
}) {
  const dist = data?.finalOpinionDistribution ?? null;

  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-5 flex flex-col">
      {/* Header wariantu */}
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[#a1a1aa] text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Ładowanie...</span>
        </div>
      )}

      {error && (
        <div className="text-red-400 text-sm">{error}</div>
      )}

      {!loading && !error && data && (
        <>
          {/* Nazwa i status */}
          <div>
            <div className="text-white font-medium text-sm mb-1">
              {data.studyName ?? data.id}
            </div>
            <span className={`text-xs font-medium ${getStatusColor(data.status)}`}>
              {getStatusLabel(data.status)}
            </span>
          </div>

          {/* Rozkład opinii */}
          {dist ? (
            <div className="space-y-2">
              <div className="text-xs text-[#a1a1aa] mb-2 font-medium uppercase tracking-wide">Rozkład opinii</div>
              <ProgressBar value={dist.positive} color="#22c55e" label="Pozytywni" />
              <ProgressBar value={dist.neutral} color="#a1a1aa" label="Neutralni" />
              <ProgressBar value={dist.negative} color="#ef4444" label="Negatywni" />
            </div>
          ) : (
            <div className="text-xs text-[#52525b]">Brak danych o rozkładzie opinii</div>
          )}

          {/* Synteza agentów */}
          {data.reportAgentSynthesis && (
            <div>
              <div className="text-xs text-[#a1a1aa] mb-2 font-medium uppercase tracking-wide">Synteza</div>
              <p className="text-sm text-[#d4d4d8] leading-relaxed line-clamp-6">
                {data.reportAgentSynthesis}
              </p>
            </div>
          )}

          {/* Rekomendacje */}
          {data.recommendations && data.recommendations.length > 0 && (
            <div>
              <div className="text-xs text-[#a1a1aa] mb-2 font-medium uppercase tracking-wide">Rekomendacje</div>
              <ul className="space-y-1">
                {data.recommendations.slice(0, 4).map((r, i) => (
                  <li key={i} className="text-xs text-[#d4d4d8] flex gap-2">
                    <span className="text-[#6366f1] flex-shrink-0">•</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {/* CTA */}
      <div className="mt-auto pt-4 border-t border-[#27272a]">
        <button
          type="button"
          onClick={onOpen}
          disabled={loading || !!error || !data}
          className="w-full flex items-center justify-center gap-2 bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Otwórz pełny widok
        </button>
      </div>
    </div>
  );
}

// ─── Główny komponent ─────────────────────────────────────────────────────────

export function SimulationCompare() {
  const { idA, idB } = useParams<{ idA: string; idB: string }>();
  const navigate = useNavigate();

  const [dataA, setDataA] = useState<SimData | null>(null);
  const [dataB, setDataB] = useState<SimData | null>(null);
  const [loadingA, setLoadingA] = useState(true);
  const [loadingB, setLoadingB] = useState(true);
  const [errorA, setErrorA] = useState<string | null>(null);
  const [errorB, setErrorB] = useState<string | null>(null);

  function mapState(raw: any, id: string): SimData {
    return {
      id,
      studyName: raw.studyName ?? raw.config?.studyName ?? id,
      status: raw.status,
      finalOpinionDistribution: getOpinionDist(raw) ?? undefined,
      reportAgentSynthesis: raw.reportAgentSynthesis ?? raw.report?.synthesis,
      recommendations: raw.recommendations ?? raw.report?.recommendations,
    };
  }

  useEffect(() => {
    if (!idA) return;
    setLoadingA(true);
    getSimulation(idA)
      .then((raw) => { setDataA(mapState(raw, idA)); setLoadingA(false); })
      .catch((err) => { setErrorA(err.message ?? 'Błąd ładowania'); setLoadingA(false); });
  }, [idA]);

  useEffect(() => {
    if (!idB) return;
    setLoadingB(true);
    getSimulation(idB)
      .then((raw) => { setDataB(mapState(raw, idB)); setLoadingB(false); })
      .catch((err) => { setErrorB(err.message ?? 'Błąd ładowania'); setLoadingB(false); });
  }, [idB]);

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          type="button"
          onClick={() => navigate('/simulations')}
          className="flex items-center gap-2 text-[#a1a1aa] hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Powrót do listy
        </button>
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="w-7 h-7 text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Porównanie A/B</h1>
        </div>
        <p className="text-[#a1a1aa] text-sm">
          Wyniki dwóch wariantów symulacji side-by-side.
        </p>
      </div>

      {/* Kolumny */}
      <div className="grid grid-cols-2 gap-6">
        <SimColumn
          label="Wariant A"
          accentColor="#6366f1"
          data={dataA}
          loading={loadingA}
          error={errorA}
          onOpen={() => idA && navigate(`/simulation/${idA}`)}
        />
        <SimColumn
          label="Wariant B"
          accentColor="#f59e0b"
          data={dataB}
          loading={loadingB}
          error={errorB}
          onOpen={() => idB && navigate(`/simulation/${idB}`)}
        />
      </div>
    </div>
  );
}
