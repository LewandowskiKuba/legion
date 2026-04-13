import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { Button } from '../components/ui/button';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Download, Plus, TrendingUp, TrendingDown, Eye, Heart, ShoppingCart, Shield, Share2, MessageCircle, AlertTriangle, ChevronRight, Info, Sparkles, Loader2 } from 'lucide-react';
import { type StudyResult, fetchSummary, exportPDF, mapReportToStudyResult } from '../utils/api';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '../components/ui/drawer';

export function Results() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<StudyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedSegment, setSelectedSegment] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // 1. Spróbuj z sessionStorage
      const stored = sessionStorage.getItem('currentStudy');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as StudyResult;
          setResult(parsed);
          if (parsed._raw) {
            setSummaryLoading(true);
            fetchSummary(parsed).then(setSummary).catch(() => setSummary(null)).finally(() => setSummaryLoading(false));
          }
          setLoading(false);
          return;
        } catch {}
      }
      // 2. Załaduj z serwera po id z URL
      if (!id) { setNotFound(true); setLoading(false); return; }
      try {
        const res = await fetch(`/api/results/${encodeURIComponent(id)}`);
        if (!res.ok) { setNotFound(true); setLoading(false); return; }
        const raw = await res.json();
        const parsed = mapReportToStudyResult(raw);
        sessionStorage.setItem('currentStudy', JSON.stringify(parsed));
        setResult(parsed);
        if (parsed._raw) {
          setSummaryLoading(true);
          fetchSummary(parsed).then(setSummary).catch(() => setSummary(null)).finally(() => setSummaryLoading(false));
        }
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96 gap-3">
        <Loader2 className="w-5 h-5 text-[#6366f1] animate-spin" />
        <div className="text-[#a1a1aa]">Ładowanie wyników...</div>
      </div>
    );
  }

  if (notFound || !result) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <div className="text-white font-medium">Nie znaleziono wyników</div>
        <div className="text-[#a1a1aa] text-sm">To badanie nie istnieje lub zostało usunięte.</div>
        <Link to="/studies" className="text-[#6366f1] text-sm hover:underline mt-2">← Wróć do historii</Link>
      </div>
    );
  }

  const radarData = [
    { metric: 'Attention', value: result.metrics.attention, fullMark: 10 },
    { metric: 'Resonance', value: result.metrics.resonance, fullMark: 10 },
    { metric: 'Purchase Intent', value: result.metrics.purchaseIntentDelta / 2, fullMark: 10 },
    { metric: 'Trust', value: result.metrics.trustDelta / 1.5, fullMark: 10 },
  ];

  const handleExportPDF = async () => {
    if (!result._raw) { alert('Brak danych do eksportu'); return; }
    setPdfLoading(true);
    try {
      await exportPDF(result);
    } catch (err: any) {
      alert(`Błąd PDF: ${err.message}`);
    } finally {
      setPdfLoading(false);
    }
  };

  const openSegmentDrawer = (segmentType: string, data: any) => {
    setSelectedSegment({ type: segmentType, data });
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">{result.campaignName}</h2>
          <p className="text-sm text-[#a1a1aa] mt-1">
            {new Date(result.date).toLocaleDateString('pl-PL', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleExportPDF} disabled={pdfLoading} variant="outline" className="border-[#27272a] text-white hover:bg-[#27272a] rounded-lg">
            {pdfLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            {pdfLoading ? 'Generowanie...' : 'Pobierz PDF'}
          </Button>
          <Link to="/new-study">
            <Button className="bg-[#6366f1] hover:bg-[#5558e3] text-white rounded-lg">
              <Plus className="w-4 h-4 mr-2" />
              Nowe badanie
            </Button>
          </Link>
        </div>
      </div>

      {/* Executive Summary */}
      {(summaryLoading || summary) && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-[#6366f1]" />
            <h3 className="text-sm font-semibold text-white">Executive Summary</h3>
          </div>
          {summaryLoading ? (
            <div className="flex items-center gap-2 text-[#a1a1aa] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generuję podsumowanie...</span>
            </div>
          ) : (
            <p className="text-sm text-[#d4d4d8] leading-relaxed">{summary}</p>
          )}
        </div>
      )}

      {/* Main Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Attention Score"
          tooltip="Jak bardzo kreacja przyciąga uwagę i jest zapamiętywana (skala 0–10)"
          value={result.metrics.attention.toFixed(1)}
          icon={Eye}
          color="#6366f1"
        />
        <MetricCard
          label="Resonance"
          tooltip="Jak bardzo przekaz trafia w wartości i potrzeby odbiorcy (skala 0–10)"
          value={result.metrics.resonance.toFixed(1)}
          icon={Heart}
          color="#8b5cf6"
        />
        <MetricCard
          label="Purchase Intent Δ"
          tooltip="Zmiana gotowości do zakupu po ekspozycji na kreację (zakres –5 do +5%)"
          value={`${result.metrics.purchaseIntentDelta >= 0 ? '+' : ''}${result.metrics.purchaseIntentDelta}%`}
          icon={ShoppingCart}
          color={result.metrics.purchaseIntentDelta >= 0 ? "#10b981" : "#ef4444"}
          trend={result.metrics.purchaseIntentDelta >= 0 ? "up" : "down"}
        />
        <MetricCard
          label="Trust Δ"
          tooltip="Zmiana poziomu zaufania do marki po ekspozycji na kreację (zakres –5 do +5%)"
          value={`${result.metrics.trustDelta >= 0 ? '+' : ''}${result.metrics.trustDelta}%`}
          icon={Shield}
          color={result.metrics.trustDelta >= 0 ? "#10b981" : "#ef4444"}
          trend={result.metrics.trustDelta >= 0 ? "up" : "down"}
        />
      </div>

      {/* Profil metryczny + Rozkłady Bayessowskie */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Profil metryczny</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#27272a" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fill: '#a1a1aa', fontSize: 9 }} />
                <Radar name="Score" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="col-span-2 bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Rozkład odpowiedzi populacji <span className="text-[#52525b] font-normal text-xs">(90% HDI zacieniowane)</span></h3>
          <BayesianPanel result={result} />
        </div>
      </div>

      {/* Segment Tables */}
      <div className="grid grid-cols-3 gap-4">
        <SegmentCard
          title="Segmentacja wiekowa"
          data={result.segmentData.age}
          onViewDetails={() => openSegmentDrawer('age', result.segmentData.age)}
        />
        <SegmentCard
          title="Segmentacja płciowa"
          data={result.segmentData.gender}
          onViewDetails={() => openSegmentDrawer('gender', result.segmentData.gender)}
        />
        <SegmentCard
          title="Segmentacja geograficzna"
          data={result.segmentData.location}
          onViewDetails={() => openSegmentDrawer('location', result.segmentData.location)}
        />
      </div>

      {/* Insights Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <MessageCircle className="w-5 h-5 text-[#6366f1]" />
            <h3 className="font-semibold text-white">Top Recall</h3>
          </div>
          <ul className="space-y-2">
            {result.topRecall.map((item, i) => (
              <li key={i} className="text-sm text-[#a1a1aa] pl-4 border-l-2 border-[#27272a]">
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Share2 className="w-5 h-5 text-[#10b981]" />
            <h3 className="font-semibold text-white">WOM Quotes</h3>
          </div>
          <ul className="space-y-3">
            {result.womQuotes.map((quote, i) => (
              <li key={i} className="text-sm text-[#a1a1aa] italic">
                {quote}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-[#f59e0b]" />
            <h3 className="font-semibold text-white">Sygnały odrzucenia</h3>
          </div>
          <ul className="space-y-2">
            {result.rejectionSignals.map((signal, i) => (
              <li key={i} className="text-sm text-[#fca5a5] pl-4 border-l-2 border-[#ef4444]/30">
                {signal}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Social Spread */}
      {result.socialSpread && (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-[#7c3aed]" />
            <h3 className="text-lg font-semibold text-white">Social Spread Analysis</h3>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div>
              <div className="mb-4">
                <div className="text-sm text-[#a1a1aa] mb-2">Viral Score</div>
                <div className="text-5xl font-bold text-[#7c3aed]">{result.socialSpread.viralScore.toFixed(0)}</div>
              </div>

              <div className="space-y-3 mt-6">
                {result.socialSpread.chains.map((chain, i) => (
                  <div key={i} className="bg-[#0f0f11] rounded-lg p-4 border border-[#27272a]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white">Level {chain.depth}</span>
                      <span className="text-xs text-[#a1a1aa]">Reach: {chain.reach}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[#27272a] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#7c3aed] rounded-full transition-all"
                          style={{ width: `${(chain.engagement / 10) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#a1a1aa] w-12 text-right">{chain.engagement.toFixed(1)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="text-sm text-[#a1a1aa] mb-4">Propagacja w czasie</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.socialSpread.chains}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="depth" tick={{ fill: '#a1a1aa' }} label={{ value: 'Depth', position: 'insideBottom', offset: -5, fill: '#a1a1aa' }} />
                    <YAxis tick={{ fill: '#a1a1aa' }} label={{ value: 'Reach', angle: -90, position: 'insideLeft', fill: '#a1a1aa' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar dataKey="reach" fill="#7c3aed" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Segment Deep Dive Drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="bg-[#18181b] border-t border-[#27272a] max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle className="text-white">
              {selectedSegment?.type === 'age' && 'Analiza segmentu wiekowego'}
              {selectedSegment?.type === 'gender' && 'Analiza segmentu płciowego'}
              {selectedSegment?.type === 'location' && 'Analiza segmentu geograficznego'}
            </DrawerTitle>
          </DrawerHeader>
          <div className="p-6">
            {selectedSegment && (
              <div className="space-y-6">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={selectedSegment.data}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                      <XAxis dataKey="segment" tick={{ fill: '#a1a1aa', fontSize: 11 }} />
                      <YAxis tick={{ fill: '#a1a1aa' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                        labelStyle={{ color: '#fff' }}
                      />
                      <Bar dataKey="attention" fill="#6366f1" name="Attention" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="resonance" fill="#8b5cf6" name="Resonance" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="purchaseIntent" fill="#10b981" name="Purchase Intent" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  {selectedSegment.data.map((seg: any, i: number) => (
                    <div key={i} className="bg-[#0f0f11] border border-[#27272a] rounded-lg p-4">
                      <div className="text-sm font-medium text-white mb-3">{seg.segment}</div>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-[#a1a1aa]">Attention:</span>
                          <span className="text-white font-medium">{seg.attention.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#a1a1aa]">Resonance:</span>
                          <span className="text-white font-medium">{seg.resonance.toFixed(1)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#a1a1aa]">Purchase Intent:</span>
                          <span className="text-[#10b981] font-medium">+{seg.purchaseIntent}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function MetricCard({ label, tooltip, value, icon: Icon, color, trend }: any) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend && (
          <div className={trend === 'up' ? 'text-[#10b981]' : 'text-[#ef4444]'}>
            {trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 mb-1">
        <div className="text-sm text-[#a1a1aa]">{label}</div>
        {tooltip && (
          <div className="relative">
            <button
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              className="text-[#52525b] hover:text-[#a1a1aa] transition-colors"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
            {showTip && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-[#27272a] text-[#d4d4d8] text-xs rounded-lg px-3 py-2 shadow-lg z-10 pointer-events-none">
                {tooltip}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-white">{value}</div>
    </div>
  );
}

function SegmentCard({ title, data, onViewDetails }: any) {
  return (
    <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-white text-sm">{title}</h3>
        <button
          onClick={onViewDetails}
          className="text-[#6366f1] hover:text-[#5558e3] text-xs flex items-center gap-1 transition-colors"
        >
          Szczegóły
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      <div className="space-y-3">
        {data.slice(0, 4).map((item: any, i: number) => (
          <div key={i}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-[#a1a1aa]">{item.segment}</span>
              <span className="text-white font-medium">{item.attention.toFixed(1)}</span>
            </div>
            <div className="h-1.5 bg-[#27272a] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6366f1] rounded-full transition-all"
                style={{ width: `${(item.attention / 10) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bayesian distribution helpers ────────────────────────────────────────────

function computeDistribution(values: number[], min: number, max: number, bins = 10) {
  const range = max - min;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const bin = Math.min(bins - 1, Math.floor(((v - min) / range) * bins));
    counts[bin]++;
  }
  const total = values.length || 1;
  return counts.map((c, i) => ({
    bin: i,
    pct: c / total,
    label: (min + (i / bins) * range).toFixed(1),
  }));
}

function computeHDI(values: number[], credMass = 0.90) {
  if (values.length === 0) return { lo: 0, hi: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const window = Math.ceil(credMass * n);
  let minWidth = Infinity;
  let hdiLo = sorted[0], hdiHi = sorted[n - 1];
  for (let i = 0; i <= n - window; i++) {
    const width = sorted[i + window - 1] - sorted[i];
    if (width < minWidth) { minWidth = width; hdiLo = sorted[i]; hdiHi = sorted[i + window - 1]; }
  }
  return { lo: hdiLo, hi: hdiHi };
}

function MiniHistogram({ values, min, max, color }: { values: number[]; min: number; max: number; color: string }) {
  const bins = computeDistribution(values, min, max, 10);
  const hdi = computeHDI(values);
  const maxPct = Math.max(...bins.map(b => b.pct), 0.01);

  return (
    <div className="flex items-end gap-0.5 h-10 mt-2">
      {bins.map((b) => {
        const binMin = min + (b.bin / 10) * (max - min);
        const binMax = min + ((b.bin + 1) / 10) * (max - min);
        const inHdi = binMax >= hdi.lo && binMin <= hdi.hi;
        return (
          <div
            key={b.bin}
            title={`${b.label}: ${(b.pct * 100).toFixed(0)}%`}
            className="flex-1 rounded-sm transition-all"
            style={{
              height: `${Math.max(4, (b.pct / maxPct) * 100)}%`,
              backgroundColor: inHdi ? color : `${color}40`,
            }}
          />
        );
      })}
    </div>
  );
}

function BayesianCard({
  label, value, values, min, max, color, unit = '',
}: {
  label: string; value: number; values: number[]; min: number; max: number; color: string; unit?: string;
}) {
  const hdi = computeHDI(values);
  const sign = unit === '%' && value >= 0 ? '+' : '';
  return (
    <div className="bg-[#0f0f11] border border-[#27272a] rounded-xl p-4">
      <div className="text-xs text-[#71717a] mb-1">{label}</div>
      <div className="text-2xl font-bold text-white">{sign}{value.toFixed(1)}{unit}</div>
      <MiniHistogram values={values} min={min} max={max} color={color} />
      <div className="flex justify-between text-[10px] text-[#52525b] mt-1.5">
        <span>90% HDI</span>
        <span style={{ color }}>{sign}{hdi.lo.toFixed(1)} – {sign}{hdi.hi.toFixed(1)}{unit}</span>
      </div>
    </div>
  );
}

function BayesianPanel({ result }: { result: StudyResult }) {
  const responses = result._raw?.responsesA ?? [];

  const attentionVals = responses.map((r: any) => r.attentionScore ?? 0);
  const purchaseVals = responses.map((r: any) => r.purchaseIntentDelta ?? 0);
  const trustVals = responses.map((r: any) => r.trustImpact ?? 0);
  const recognitionVals = responses.map((r: any) => r.brandRecognitionScore ?? 0);

  // Fallback to aggregate if no raw responses (loaded from history)
  const hasRaw = responses.length > 0;

  return (
    <div className="grid grid-cols-2 gap-3 h-full">
      {hasRaw ? (
        <>
          <BayesianCard label="Czytelność kreacji" value={result.metrics.attention} values={attentionVals} min={0} max={10} color="#6366f1" />
          <BayesianCard label="Chęć zakupu" value={result.metrics.purchaseIntentDelta} values={purchaseVals} min={-5} max={5} color="#10b981" unit="%" />
          <BayesianCard label="Zaufanie do marki" value={result.metrics.trustDelta} values={trustVals} min={-5} max={5} color="#8b5cf6" unit="%" />
          <BayesianCard label="Rozpoznawalność marki" value={result.metrics.brandRecognitionScore} values={recognitionVals} min={0} max={10} color="#f59e0b" />
        </>
      ) : (
        <>
          <BayesianCard label="Czytelność kreacji" value={result.metrics.attention} values={[]} min={0} max={10} color="#6366f1" />
          <BayesianCard label="Chęć zakupu" value={result.metrics.purchaseIntentDelta} values={[]} min={-5} max={5} color="#10b981" unit="%" />
          <BayesianCard label="Zaufanie do marki" value={result.metrics.trustDelta} values={[]} min={-5} max={5} color="#8b5cf6" unit="%" />
          <BayesianCard label="Rozpoznawalność marki" value={result.metrics.brandRecognitionScore} values={[]} min={0} max={10} color="#f59e0b" />
        </>
      )}
    </div>
  );
}
