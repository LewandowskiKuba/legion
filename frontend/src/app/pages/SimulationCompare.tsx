import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, ExternalLink, Loader2, BarChart3, FlaskConical, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { getSimulation, getBayesianAB, type BayesianABResult, type DimensionResult } from '../utils/api';

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
    default: return 'text-[#c0c0cc]';
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
      <div className="flex justify-between text-xs text-[#c0c0cc]">
        <span>{label}</span>
        <span className="text-white font-semibold">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 bg-[#38383f] rounded-full overflow-hidden">
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
    <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6 space-y-5 flex flex-col">
      {/* Header wariantu */}
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: accentColor }} />
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-[#c0c0cc] text-sm">
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
              <div className="text-xs text-[#c0c0cc] mb-2 font-medium uppercase tracking-wide">Rozkład opinii</div>
              <ProgressBar value={dist.positive} color="#22c55e" label="Pozytywni" />
              <ProgressBar value={dist.neutral} color="#c0c0cc" label="Neutralni" />
              <ProgressBar value={dist.negative} color="#ef4444" label="Negatywni" />
            </div>
          ) : (
            <div className="text-xs text-[#6b6b78]">Brak danych o rozkładzie opinii</div>
          )}

          {/* Synteza agentów */}
          {data.reportAgentSynthesis && (
            <div>
              <div className="text-xs text-[#c0c0cc] mb-2 font-medium uppercase tracking-wide">Synteza</div>
              <p className="text-sm text-[#d4d4d8] leading-relaxed line-clamp-6">
                {data.reportAgentSynthesis}
              </p>
            </div>
          )}

          {/* Rekomendacje */}
          {data.recommendations && data.recommendations.length > 0 && (
            <div>
              <div className="text-xs text-[#c0c0cc] mb-2 font-medium uppercase tracking-wide">Rekomendacje</div>
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
      <div className="mt-auto pt-4 border-t border-[#38383f]">
        <button
          type="button"
          onClick={onOpen}
          disabled={loading || !!error || !data}
          className="w-full flex items-center justify-center gap-2 bg-[#38383f] hover:bg-[#52525a] disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Otwórz pełny widok
        </button>
      </div>
    </div>
  );
}

// ─── Bayesian helpers ─────────────────────────────────────────────────────────

function posteriorBar(pA: number, pB: number) {
  const pctA = Math.round(pA * 100);
  const pctB = Math.round(pB * 100);
  return (
    <div className="flex h-5 rounded-full overflow-hidden w-full">
      <div
        className="h-full transition-all"
        style={{ width: `${pctA}%`, background: '#6366f1' }}
        title={`A: ${pctA}%`}
      />
      <div
        className="h-full transition-all"
        style={{ width: `${pctB}%`, background: '#f59e0b' }}
        title={`B: ${pctB}%`}
      />
    </div>
  );
}

function entropyBadge(entropy: number, needsAB: boolean) {
  if (needsAB) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/30 border border-yellow-700/40 text-yellow-400 font-semibold">Live A/B</span>;
  if (entropy < 0.5) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 border border-green-700/40 text-green-400 font-semibold">Pewny</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-orange-900/30 border border-orange-700/40 text-orange-400 font-semibold">Umiarkowany</span>;
}

function BayesianDimension({ dim, labelA, labelB }: { dim: DimensionResult; labelA: string; labelB: string }) {
  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-[#27272a] bg-[#0f0f12]">
        <span className="text-xs font-semibold text-[#a1a1aa] uppercase tracking-widest">{dim.label}</span>
      </div>
      <div className="divide-y divide-[#27272a]">
        {dim.segments.map((seg) => (
          <div key={seg.key} className="px-4 py-3 flex items-center gap-3">
            <div className="w-36 flex-shrink-0">
              <div className="text-sm text-white font-medium leading-tight">{seg.label}</div>
              <div className="text-xs text-[#52525b] mt-0.5">n={seg.n.toLocaleString('pl-PL')}</div>
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              {posteriorBar(seg.posteriorA, seg.posteriorB)}
              <div className="flex justify-between text-xs text-[#71717a]">
                <span style={{ color: '#6366f1' }}>{labelA} {Math.round(seg.posteriorA * 100)}%</span>
                <span style={{ color: '#f59e0b' }}>{labelB} {Math.round(seg.posteriorB * 100)}%</span>
              </div>
            </div>
            <div className="w-24 flex-shrink-0 text-right space-y-1">
              {entropyBadge(seg.entropy, seg.needsAB)}
              <div className="text-xs text-[#52525b]">H={seg.entropy.toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DualSignalPanel({ result, labelA, labelB }: { result: BayesianABResult; labelA: string; labelB: string }) {
  const { signal1, signal2, signalAgreement, weights } = result;
  if (!signal1 || !signal2) return null;

  const agreementColor = signalAgreement === 'agree' ? 'border-green-700/40 bg-green-900/10'
    : signalAgreement === 'disagree' ? 'border-red-700/40 bg-red-900/10'
    : 'border-yellow-700/40 bg-yellow-900/10';
  const agreementText = signalAgreement === 'agree'
    ? 'Sygnały zgodne — oba wskazują tego samego zwycięzcę'
    : signalAgreement === 'disagree'
    ? 'Sygnały rozbieżne — symulacja i ranking wskazują różnych zwycięzców (efekt kontekstu)'
    : 'Jeden z sygnałów niepewny — wynik kombinowany może być miarodajny';

  const s1WinnerLabel = signal1.globalWinner === 'A' ? labelA : signal1.globalWinner === 'B' ? labelB : 'Remis';
  const s2WinnerLabel = signal2.globalWinner === 'A' ? labelA : signal2.globalWinner === 'B' ? labelB : 'Remis';
  const s1Color = signal1.globalWinner === 'A' ? '#6366f1' : signal1.globalWinner === 'B' ? '#f59e0b' : '#71717a';
  const s2Color = signal2.globalWinner === 'A' ? '#6366f1' : signal2.globalWinner === 'B' ? '#f59e0b' : '#71717a';

  return (
    <div className="space-y-3">
      {/* Alert zgodności */}
      <div className={`border rounded-xl px-4 py-3 flex items-start gap-3 text-sm ${agreementColor}`}>
        {signalAgreement === 'agree'
          ? <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
          : signalAgreement === 'disagree'
          ? <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
          : <HelpCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />}
        <span className="text-[#d4d4d8]">{agreementText}</span>
      </div>

      {/* Dwa sygnały obok siebie */}
      <div className="grid grid-cols-2 gap-3">
        {/* Signal 1 */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-[#52525b] uppercase tracking-widest">Signal 1</div>
              <div className="text-xs text-[#71717a]">Symulacja ({Math.round((weights?.signal1 ?? 0.6) * 100)}%)</div>
            </div>
            <div className="text-sm font-bold" style={{ color: s1Color }}>{s1WinnerLabel}</div>
          </div>
          {posteriorBar(signal1.globalPosteriorA, signal1.globalPosteriorB)}
          <div className="flex justify-between text-xs mt-1">
            <span style={{ color: '#6366f1' }}>{Math.round(signal1.globalPosteriorA * 100)}%</span>
            <span className="text-[#52525b]">margin {Math.round(signal1.globalMargin * 100)} pp</span>
            <span style={{ color: '#f59e0b' }}>{Math.round(signal1.globalPosteriorB * 100)}%</span>
          </div>
        </div>

        {/* Signal 2 */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs text-[#52525b] uppercase tracking-widest">Signal 2</div>
              <div className="text-xs text-[#71717a]">Ranking porównawczy ({Math.round((weights?.signal2 ?? 0.4) * 100)}%)</div>
            </div>
            <div className="text-sm font-bold" style={{ color: s2Color }}>{s2WinnerLabel}</div>
          </div>
          {posteriorBar(signal2.globalPosteriorA, signal2.globalPosteriorB)}
          <div className="flex justify-between text-xs mt-1">
            <span style={{ color: '#6366f1' }}>{Math.round(signal2.globalPosteriorA * 100)}%</span>
            <span className="text-[#52525b]">{signal2.countA}A / {signal2.countB}B / {signal2.countTie}↔</span>
            <span style={{ color: '#f59e0b' }}>{Math.round(signal2.globalPosteriorB * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BayesianSection({ idA, idB, statusA, statusB }: {
  idA: string; idB: string; statusA?: string; statusB?: string;
}) {
  const [result, setResult] = useState<BayesianABResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [labelA] = useState('Wariant A');
  const [labelB] = useState('Wariant B');

  const bothReady = statusA === 'complete' && statusB === 'complete';

  useEffect(() => {
    if (!bothReady) return;
    setLoading(true);
    getBayesianAB(idA, idB)
      .then((r) => { setResult(r); setLoading(false); })
      .catch((e) => { setError(e.message ?? 'Błąd'); setLoading(false); });
  }, [idA, idB, bothReady]);

  if (!bothReady) {
    return (
      <div className="mt-8 bg-[#18181b] border border-[#27272a] rounded-xl p-6 flex items-center gap-3 text-[#71717a] text-sm">
        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
        Analiza Bayesowska dostępna po zakończeniu obu symulacji…
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mt-8 bg-[#18181b] border border-[#27272a] rounded-xl p-6 flex items-center gap-3 text-[#a1a1aa] text-sm">
        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
        Obliczam posteriors Bayesowskie + ranking porównawczy (Signal 2)…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 bg-red-900/10 border border-red-800/30 rounded-xl p-4 text-red-400 text-sm">
        Błąd analizy: {error}
      </div>
    );
  }

  if (!result) return null;

  const globalPctA = Math.round(result.globalPosteriorA * 100);
  const globalPctB = Math.round(result.globalPosteriorB * 100);
  const globalMarginPct = Math.round(result.globalMargin * 100);

  const winnerColor = result.globalWinner === 'A' ? '#6366f1' : result.globalWinner === 'B' ? '#f59e0b' : '#71717a';
  const winnerLabel = result.globalWinner === 'A' ? labelA : result.globalWinner === 'B' ? labelB : 'Remis / niepewne';

  const confidenceIcon = result.confidenceLevel === 'high'
    ? <CheckCircle2 className="w-4 h-4 text-green-400" />
    : result.confidenceLevel === 'moderate'
    ? <AlertTriangle className="w-4 h-4 text-yellow-400" />
    : <HelpCircle className="w-4 h-4 text-orange-400" />;

  const confidenceLabel = { high: 'Wysoka pewność', moderate: 'Umiarkowana pewność', low: 'Niska pewność — rekomenduj live A/B' }[result.confidenceLevel];

  return (
    <div className="mt-8 space-y-6">
      {/* Nagłówek sekcji */}
      <div className="flex items-center gap-3">
        <FlaskConical className="w-5 h-5 text-[#6366f1]" />
        <h2 className="text-lg font-semibold text-white">Analiza Bayesowska</h2>
        <span className="text-xs text-[#52525b] ml-1">P(kreacja = najlepsza | evidence)</span>
      </div>

      {/* Dual-signal panel — tylko gdy mamy oba sygnały */}
      {result.signal1 && <DualSignalPanel result={result} labelA={labelA} labelB={labelB} />}

      {/* Global posterior */}
      <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-xs text-[#71717a] uppercase tracking-widest mb-1">Globalny posterior</div>
            <div className="text-2xl font-bold" style={{ color: winnerColor }}>{winnerLabel}</div>
            <div className="flex items-center gap-1.5 mt-1">
              {confidenceIcon}
              <span className="text-sm text-[#a1a1aa]">{confidenceLabel}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#52525b] mb-1">Margin</div>
            <div className="text-xl font-bold text-white">{globalMarginPct} pp</div>
            <div className="text-xs text-[#52525b]">n={result.totalPersonas.toLocaleString('pl-PL')} person</div>
          </div>
        </div>

        {/* Pasek globalny */}
        <div className="space-y-2">
          {posteriorBar(result.globalPosteriorA, result.globalPosteriorB)}
          <div className="flex justify-between text-sm font-semibold">
            <span style={{ color: '#6366f1' }}>{labelA} — {globalPctA}%</span>
            <span style={{ color: '#f59e0b' }}>{labelB} — {globalPctB}%</span>
          </div>
        </div>

        <div className="mt-4 text-xs text-[#52525b] border-t border-[#27272a] pt-3">
          Średnia geometryczna posteriorów per segment (penalizuje niespójność między grupami). Próg A/B: margin &lt; 15%.
        </div>
      </div>

      {/* Priority A/B list */}
      {result.priorityAB.length > 0 && (
        <div className="bg-[#1c1a0f] border border-yellow-800/30 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            <span className="text-sm font-semibold text-yellow-400">
              {result.priorityAB.length} {result.priorityAB.length === 1 ? 'segment wymaga' : 'segmentów wymaga'} live A/B testu
            </span>
          </div>
          <div className="space-y-2">
            {result.priorityAB.map((p, i) => (
              <div key={`${p.dimension}-${p.label}`} className="flex items-center gap-3 py-2 border-b border-yellow-900/20 last:border-0">
                <span className="text-xs font-bold text-yellow-600 w-5 text-center">{i + 1}</span>
                <div className="flex-1">
                  <span className="text-sm text-white font-medium">{p.label}</span>
                  <span className="text-xs text-[#52525b] ml-2">{p.dimensionLabel}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-yellow-400">
                    {p.winner === 'A' ? labelA : labelB} {Math.round(p.winnerPosterior * 100)}%
                    <span className="text-[#52525b] ml-1">vs {Math.round(p.runnerUpPosterior * 100)}%</span>
                  </div>
                  <div className="text-xs text-[#52525b]">margin {Math.round(p.margin * 100)} pp · H={p.entropy.toFixed(2)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.priorityAB.length === 0 && (
        <div className="bg-green-900/10 border border-green-800/30 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <div className="text-sm text-green-400">
            Brak segmentów wymagających live A/B — posterior jest rozstrzygnięty we wszystkich grupach demograficznych.
          </div>
        </div>
      )}

      {/* Heatmapa per wymiar */}
      <div>
        <h3 className="text-sm font-semibold text-[#a1a1aa] uppercase tracking-widest mb-4">Posterior per segment</h3>
        <div className="space-y-4">
          {result.dimensions.map((dim) => (
            <BayesianDimension key={dim.dimension} dim={dim} labelA={labelA} labelB={labelB} />
          ))}
        </div>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-4 text-xs text-[#52525b] pt-2 border-t border-[#27272a]">
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#6366f1' }} />Wariant A</span>
        <span><span className="inline-block w-3 h-3 rounded-sm mr-1" style={{ background: '#f59e0b' }} />Wariant B</span>
        <span>H = entropia Shannona (0 = pewny wynik, 1 = maksymalna niepewność)</span>
        <span>Live A/B = margin &lt; 15 pp</span>
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
          className="flex items-center gap-2 text-[#c0c0cc] hover:text-white text-sm mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Powrót do listy
        </button>
        <div className="flex items-center gap-3 mb-2">
          <BarChart3 className="w-7 h-7 text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Porównanie A/B</h1>
        </div>
        <p className="text-[#c0c0cc] text-sm">
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

      {/* Analiza Bayesowska */}
      {idA && idB && (
        <BayesianSection
          idA={idA}
          idB={idB}
          statusA={dataA?.status}
          statusB={dataB?.status}
        />
      )}
    </div>
  );
}
