import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  Users, TrendingUp, TrendingDown, Minus, ArrowRight,
  Play, CheckCircle2, Clock, Zap, Network,
} from 'lucide-react';
import { getPopulation, listSimulations, type PopulationStats } from '../utils/api';
import { Button } from '../components/ui/button';

interface SimulationListItem {
  id: string;
  studyName: string;
  status: string;
  seedType: string;
  createdAt: string;
  completedAt?: string;
  totalRounds: number;
  currentRound: number;
  populationSize: number;
  avgOpinion: number;
  positiveRatio: number;
  negativeRatio: number;
  neutralRatio: number;
}

const SEED_LABELS: Record<string, string> = {
  ad:     'Reklama',
  topic:  'Scenariusz',
  frames: 'Competitive Contagion',
};

const SEED_COLORS: Record<string, string> = {
  ad:     'bg-[#6366f1]/20 text-[#818cf8]',
  topic:  'bg-emerald-500/20 text-emerald-400',
  frames: 'bg-amber-500/20 text-amber-400',
};

function StatusBadge({ status }: { status: string }) {
  if (status === 'complete')
    return <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" />Zakończona</span>;
  if (status === 'running')
    return <span className="flex items-center gap-1 text-xs text-[#6366f1] animate-pulse"><Play className="w-3 h-3" />W toku</span>;
  if (status === 'initializing')
    return <span className="flex items-center gap-1 text-xs text-amber-400"><Clock className="w-3 h-3" />Inicjalizacja</span>;
  if (status === 'error')
    return <span className="flex items-center gap-1 text-xs text-red-400"><Minus className="w-3 h-3" />Błąd</span>;
  return <span className="text-xs text-[#6b6b7a]">{status}</span>;
}

function OpinionBar({ pos, neg, neu }: { pos: number; neg: number; neu: number }) {
  return (
    <div className="flex h-1.5 w-24 rounded overflow-hidden bg-[#1c1c22]">
      {pos > 0 && <div className="bg-emerald-500 h-full" style={{ width: `${pos}%` }} />}
      {neu > 0 && <div className="bg-[#38383f] h-full"  style={{ width: `${neu}%` }} />}
      {neg > 0 && <div className="bg-red-500 h-full"    style={{ width: `${neg}%` }} />}
    </div>
  );
}

function opinionColor(v: number) {
  if (v > 1.5)  return 'text-emerald-400';
  if (v > 0)    return 'text-emerald-300';
  if (v < -1.5) return 'text-red-400';
  if (v < 0)    return 'text-red-300';
  return 'text-[#c0c0cc]';
}

const sk = 'bg-[#38383f] rounded animate-pulse';

export function Dashboard() {
  const [population, setPopulation] = useState<PopulationStats | null>(null);
  const [sims, setSims] = useState<SimulationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [pop, simList] = await Promise.all([getPopulation(), listSimulations()]);
      setPopulation(pop);
      setSims(simList as SimulationListItem[]);
      setLoading(false);
    }
    load();
  }, []);

  const completed  = sims.filter((s) => s.status === 'complete');
  const running    = sims.filter((s) => s.status === 'running' || s.status === 'initializing');
  const recent     = sims.slice(0, 5);

  const avgOpinionAll = completed.length > 0
    ? (completed.reduce((a, s) => a + s.avgOpinion, 0) / completed.length).toFixed(1)
    : '—';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
          <p className="text-sm text-[#c0c0cc] mt-1">Przegląd symulacji i syntetycznej populacji</p>
        </div>
        <Link to="/new-simulation">
          <Button className="bg-[#6366f1] hover:bg-[#5558e3] text-white rounded-lg px-6">
            Nowa symulacja
          </Button>
        </Link>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: Network,      color: 'text-[#6366f1]', bg: 'bg-[#6366f1]/10', label: 'Wszystkich symulacji',   value: loading ? null : sims.length },
          { icon: Play,         color: 'text-amber-400',  bg: 'bg-amber-400/10',  label: 'W toku',                value: loading ? null : running.length },
          { icon: CheckCircle2, color: 'text-emerald-400',bg: 'bg-emerald-400/10',label: 'Zakończonych',          value: loading ? null : completed.length },
          { icon: TrendingUp,   color: 'text-[#c0c0cc]',  bg: 'bg-[#38383f]',    label: 'Śr. opinia (ukończone)',value: loading ? null : avgOpinionAll },
        ].map(({ icon: Icon, color, bg, label, value }) => (
          <div key={label} className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-5">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <div className="text-xs text-[#c0c0cc] mb-0.5">{label}</div>
                {value === null
                  ? <div className={`h-6 w-12 ${sk}`} />
                  : <div className="text-xl font-semibold text-white">{value}</div>
                }
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Population */}
      <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Syntetyczna populacja</h3>
            <p className="text-xs text-[#c0c0cc]">Kalibracja: GUS BDL 2024 · NSP 2021 · CBOS 2025</p>
          </div>
          <Link to="/population">
            <Button variant="ghost" size="sm" className="text-[#6366f1] hover:bg-[#38383f] text-xs">
              Szczegóły <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {[
            { label: 'Wielkość próby', value: population ? `n=${population.total}` : null },
            { label: 'Średni wiek',    value: population ? `${population.averageAge} lat` : null },
            { label: 'Kobiety',        value: population ? `${population.genderDistribution.female}%` : null },
            { label: 'Miasta >100k',   value: population ? `${population.regions.urban}%` : null },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-1">
              <div className="text-xs text-[#c0c0cc]">{label}</div>
              {value ? <p className="text-2xl font-semibold text-white">{value}</p> : <div className={`h-8 w-20 ${sk}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Recent simulations */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-white">Ostatnie symulacje</h3>
          <Link to="/simulations">
            <Button variant="ghost" size="sm" className="text-[#6366f1] hover:bg-[#38383f] text-xs">
              Wszystkie <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>

        <div className="space-y-2">
          {loading && [0, 1, 2].map((i) => (
            <div key={i} className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className={`h-4 w-48 ${sk}`} />
                  <div className={`h-3 w-24 ${sk}`} />
                </div>
                <div className={`h-4 w-24 ${sk}`} />
              </div>
            </div>
          ))}

          {!loading && recent.length === 0 && (
            <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-8 text-center">
              <Zap className="w-8 h-8 text-[#38383f] mx-auto mb-3" />
              <p className="text-sm text-[#c0c0cc]">Brak symulacji. Zacznij od nowej.</p>
              <Link to="/new-simulation">
                <Button className="mt-4 bg-[#6366f1] hover:bg-[#5558e3] text-white text-sm">
                  Utwórz symulację
                </Button>
              </Link>
            </div>
          )}

          {!loading && recent.map((sim) => (
            <Link key={sim.id} to={`/simulation/${sim.id}`}>
              <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-4 hover:border-[#6366f1] transition-colors cursor-pointer group">
                <div className="flex items-center gap-4">
                  {/* Name + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white group-hover:text-[#6366f1] transition-colors truncate">
                        {sim.studyName}
                      </span>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${SEED_COLORS[sim.seedType] ?? 'bg-[#38383f] text-[#c0c0cc]'}`}>
                        {SEED_LABELS[sim.seedType] ?? sim.seedType}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[#6b6b7a]">
                      <StatusBadge status={sim.status} />
                      <span>·</span>
                      <span>{new Date(sim.createdAt).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span>·</span>
                      <span>{sim.populationSize.toLocaleString()} agentów</span>
                      <span>·</span>
                      <span>runda {sim.currentRound}/{sim.totalRounds}</span>
                    </div>
                  </div>

                  {/* Opinion */}
                  {sim.status === 'complete' && (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-[#6b6b7a] mb-1">Śr. opinia</div>
                        <div className={`text-base font-mono font-semibold ${opinionColor(sim.avgOpinion)}`}>
                          {sim.avgOpinion > 0 ? '+' : ''}{sim.avgOpinion.toFixed(1)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-[#6b6b7a] mb-1.5">Rozkład</div>
                        <OpinionBar pos={sim.positiveRatio} neg={sim.negativeRatio} neu={sim.neutralRatio} />
                        <div className="flex gap-2 text-xs mt-1 text-[#6b6b7a]">
                          <span className="text-emerald-400">{sim.positiveRatio}%</span>
                          <span className="text-red-400">{sim.negativeRatio}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {sim.status === 'running' && (
                    <div className="shrink-0 text-right">
                      <div className="text-xs text-[#6b6b7a] mb-1">Postęp</div>
                      <div className="text-sm font-mono text-[#6366f1]">
                        {Math.round(sim.currentRound / sim.totalRounds * 100)}%
                      </div>
                    </div>
                  )}

                  <ArrowRight className="w-4 h-4 text-[#38383f] group-hover:text-[#6366f1] transition-colors shrink-0" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
