import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  Network, Loader2, MessageSquare, Zap, CheckCircle2,
  TrendingUp, TrendingDown, Minus, Users, Send, X, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  streamSimulation, injectSimulationEvent, chatWithSimulationAgent
} from '../utils/api';
import { SocialGraph } from '../components/SocialGraph';
import { FrameCompetitionChart } from '../components/FrameCompetitionChart';
import { DemographicBreakdown } from '../components/DemographicBreakdown';
import type { DemographicBreakdownData } from '../components/DemographicBreakdown';
import { Progress } from '../components/ui/progress';

function formatEta(ms: number): string {
  if (ms <= 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentAction {
  personaId: string;
  personaName: string;
  round: number;
  platform: string;
  actionType: string;
  content: string;
  targetPersonaId?: string;
  opinionDelta: number;
  currentOpinion: number;
}

interface SimRound {
  roundNumber: number;
  actions: AgentAction[];
  avgOpinion: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  viralPaths: Array<{ from: string; fromName: string; to: string; toName: string; content: string }>;
  frameAdoption?: Record<string, number>;
}

interface SimFrame { id: string; label: string; text: string; }
interface FrameSegmentStats { segment: string; frameShares: Record<string, number>; }
interface FrameRoundStats {
  roundNumber: number;
  frameAdoption: Record<string, number>;
  frameShare: Record<string, number>;
  byAgeGroup: FrameSegmentStats[];
  byPolitical: FrameSegmentStats[];
}

interface SimState {
  id: string;
  studyName: string;
  status: string;
  currentRound: number;
  totalRounds: number;
  rounds: SimRound[];
  population: Array<{ id: string; name: string; demographic?: { age: number }; political?: { affiliation: string } }>;
  knowledgeGraph: { brand: string; claims: string[]; controversialElements: string[] };
  agentOpinions: Record<string, number>;
  demographicBreakdown?: DemographicBreakdownData;
  frames?: SimFrame[];
  agentFrames?: Record<string, string>;
  frameStats?: FrameRoundStats[];
  insights?: {
    reportAgentSynthesis: string;
    recommendations: string[];
    finalOpinionDistribution: { positive: number; negative: number; neutral: number };
    coalitionMap: Array<{ name: string; size: number; sentiment: string; dominantPoliticalAffiliation: string }>;
    influencerPersonas: Array<{ personaId: string; personaName: string; reachScore: number }>;
    viralMoments: Array<{ round: number; content: string; reach: number; personaName: string }>;
    opinionTrajectory: Array<{ round: number; avgOpinion: number; positiveCount: number; negativeCount: number }>;
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionCard({ action }: { action: AgentAction }) {
  const typeColors: Record<string, string> = {
    post: 'text-blue-400',
    comment: 'text-purple-400',
    share: 'text-green-400',
    like: 'text-pink-400',
    react_neg: 'text-red-400',
    ignore: 'text-[#6b6b78]',
  };

  const typeLabels: Record<string, string> = {
    post: 'post', comment: 'komentarz', share: 'udostępnienie',
    like: 'like', react_neg: 'reakcja neg.', ignore: 'pominął',
  };

  if (action.actionType === 'ignore' || !action.content) return null;

  const deltaColor = action.opinionDelta > 0
    ? 'text-green-400' : action.opinionDelta < 0
    ? 'text-red-400' : 'text-[#9898a8]';

  return (
    <div className="bg-[#1c1c1f] border border-[#38383f] rounded-lg p-3 space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white text-sm font-medium">{action.personaName}</span>
          <span className={`text-xs ${typeColors[action.actionType] ?? 'text-[#9898a8]'}`}>
            {typeLabels[action.actionType] ?? action.actionType}
          </span>
        </div>
        <span className={`text-xs font-mono ${deltaColor}`}>
          {action.opinionDelta > 0 ? '+' : ''}{action.opinionDelta.toFixed(1)}
        </span>
      </div>
      <p className="text-[#c0c0cc] text-sm leading-relaxed">{action.content}</p>
    </div>
  );
}

function RoundAccordion({ round, defaultOpen }: { round: SimRound; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  const posts = round.actions.filter(a => a.content && a.actionType !== 'ignore');

  return (
    <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#1c1c1f] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-white font-semibold text-sm">Runda {round.roundNumber}</span>
          <span className="text-xs text-[#9898a8]">{posts.length} akcji</span>
          <span className="text-xs text-green-400">↑{round.positiveCount}</span>
          <span className="text-xs text-red-400">↓{round.negativeCount}</span>
          <span className="text-xs text-[#9898a8]">→{round.neutralCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-mono ${round.avgOpinion > 0 ? 'text-green-400' : round.avgOpinion < 0 ? 'text-red-400' : 'text-[#9898a8]'}`}>
            avg {round.avgOpinion > 0 ? '+' : ''}{round.avgOpinion.toFixed(2)}
          </span>
          {open ? <ChevronUp className="w-4 h-4 text-[#9898a8]" /> : <ChevronDown className="w-4 h-4 text-[#9898a8]" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-[#38383f] pt-3">
          {posts.length === 0
            ? <p className="text-[#6b6b78] text-sm">Brak aktywnych akcji w tej rundzie.</p>
            : posts.map((a, i) => <ActionCard key={i} action={a} />)
          }
        </div>
      )}
    </div>
  );
}

// ─── Chat Drawer ──────────────────────────────────────────────────────────────

function ChatDrawer({
  simId,
  population,
  onClose,
}: {
  simId: string;
  population: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedName = selectedPersonaId
    ? population.find(p => p.id === selectedPersonaId)?.name ?? 'Agent'
    : 'ReportAgent';

  async function send() {
    if (!message.trim() || loading) return;
    const text = message.trim();
    setMessage('');
    setMessages(m => [...m, { role: 'user', text }]);
    setLoading(true);
    try {
      const reply = await chatWithSimulationAgent(simId, selectedPersonaId, text);
      setMessages(m => [...m, { role: 'agent', text: reply }]);
    } catch {
      setMessages(m => [...m, { role: 'agent', text: 'Błąd połączenia z agentem.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-[#1f1f25] border-l border-[#38383f] flex flex-col z-50 shadow-2xl">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#38383f]">
        <div>
          <p className="text-white font-semibold text-sm">Chat z agentem</p>
          <p className="text-[#9898a8] text-xs">{selectedName}</p>
        </div>
        <button onClick={onClose} className="text-[#9898a8] hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Persona selector */}
      <div className="px-4 py-2 border-b border-[#38383f]">
        <select
          value={selectedPersonaId ?? ''}
          onChange={e => { setSelectedPersonaId(e.target.value || null); setMessages([]); }}
          className="w-full bg-[#111113] border border-[#52525a] rounded-lg text-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#6366f1]"
        >
          <option value="">ReportAgent (synteza)</option>
          {population.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-[#6b6b78] text-xs text-center mt-4">
            {selectedPersonaId
              ? 'Zadaj pytanie tej personie o jej odczucia i opinie po symulacji.'
              : 'Zapytaj ReportAgent o wyniki, wnioski lub rekomendacje.'
            }
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'bg-[#6366f1] text-white'
                : 'bg-[#38383f] text-[#e4e4e7]'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-[#38383f] rounded-xl px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#9898a8]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-[#38383f] flex gap-2">
        <input
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Wpisz wiadomość..."
          className="flex-1 bg-[#111113] border border-[#52525a] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
        />
        <button
          onClick={send}
          disabled={!message.trim() || loading}
          className="bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white rounded-lg px-3 py-2"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Event Injector ───────────────────────────────────────────────────────────

function EventInjector({ simId, onInjected }: { simId: string; onInjected: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('breaking_news');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const EVENT_TYPES = [
    { value: 'breaking_news', label: 'Breaking news' },
    { value: 'influencer_post', label: 'Post influencera' },
    { value: 'competitor_ad', label: 'Reklama konkurencji' },
    { value: 'crisis', label: 'Kryzys PR' },
    { value: 'pr_response', label: 'Odpowiedź PR' },
  ];

  async function inject() {
    if (!content.trim()) return;
    setLoading(true);
    try {
      await injectSimulationEvent(simId, type, content.trim());
      setContent('');
      setOpen(false);
      onInjected();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-2 bg-[#38383f] hover:bg-[#52525a] text-[#c0c0cc] hover:text-white rounded-lg text-sm transition-colors"
      >
        <Zap className="w-4 h-4" />
        Wstrzyknij event
      </button>

      {open && (
        <div className="absolute top-full mt-2 right-0 w-80 bg-[#1f1f25] border border-[#38383f] rounded-xl p-4 shadow-xl z-40 space-y-3">
          <p className="text-white text-sm font-semibold">Nowy event</p>
          <select
            value={type}
            onChange={e => setType(e.target.value)}
            className="w-full bg-[#111113] border border-[#52525a] rounded-lg text-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#6366f1]"
          >
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Treść eventu, np. 'Znana influencerka skrytykowała markę na TikToku'"
            rows={3}
            className="w-full bg-[#111113] border border-[#52525a] rounded-lg text-white px-2 py-1.5 text-xs focus:outline-none focus:border-[#6366f1] resize-none"
          />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="flex-1 py-1.5 text-xs text-[#9898a8] hover:text-white border border-[#38383f] rounded-lg">Anuluj</button>
            <button
              onClick={inject}
              disabled={!content.trim() || loading}
              className="flex-1 py-1.5 text-xs bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white rounded-lg"
            >
              {loading ? 'Wysyłam...' : 'Wstrzyknij'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SimulationView() {
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<SimState | null>(null);
  const [status, setStatus] = useState<'initializing' | 'running' | 'complete' | 'error'>('initializing');
  const [progress, setProgress] = useState({ current: 0, total: 0, eta: '' });
  const [chatOpen, setChatOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;

    const stop = streamSimulation(id, {
      onState: (s) => {
        setState(s);
        setStatus(s.status === 'complete' ? 'complete' : s.status === 'error' ? 'error' : 'running');
      },
      onRound: (round) => {
        setState(prev => {
          if (!prev) return prev;
          const rounds = [...prev.rounds.filter(r => r.roundNumber !== round.roundNumber), round]
            .sort((a, b) => a.roundNumber - b.roundNumber);
          return { ...prev, rounds, currentRound: round.roundNumber, agentOpinions: round.opinionSnapshot };
        });
        setStatus('running');
      },
      onProgress: (current, total) => {
        if (!startTimeRef.current) startTimeRef.current = Date.now();
        const elapsed = Date.now() - startTimeRef.current;
        const rate = current / elapsed;
        const eta = rate > 0 ? formatEta((total - current) / rate) : '';
        setProgress({ current, total, eta });
        setStatus('running');
      },
      onComplete: (s) => {
        setState(s);
        setStatus('complete');
      },
      onError: (msg) => {
        setError(msg);
        setStatus('error');
      },
    });

    stopRef.current = stop;
    return () => stop();
  }, [id]);

  if (!state && status === 'initializing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#6366f1]" />
        <p className="text-[#c0c0cc]">Inicjalizuję symulację (GraphRAG)…</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center space-y-4">
        <p className="text-red-400 text-lg font-semibold">Błąd symulacji</p>
        <p className="text-[#9898a8] text-sm">{error ?? 'Nieznany błąd'}</p>
        <Link to="/new-simulation" className="text-[#6366f1] text-sm hover:underline">← Nowa symulacja</Link>
      </div>
    );
  }

  const chartData = state?.rounds.map(r => ({
    runda: r.roundNumber,
    'Avg opinia': parseFloat(r.avgOpinion.toFixed(2)),
    Pozytywni: r.positiveCount,
    Negatywni: r.negativeCount,
    Neutralni: r.neutralCount,
  })) ?? [];

  const dist = state?.insights?.finalOpinionDistribution;
  const isRunning = status === 'running';

  return (
    <div className={`space-y-6 ${chatOpen ? 'pr-96' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Network className="w-5 h-5 text-[#6366f1]" />
            <h1 className="text-xl font-bold text-white">{state?.studyName ?? 'Symulacja'}</h1>
            {isRunning && <Loader2 className="w-4 h-4 animate-spin text-[#6366f1]" />}
            {status === 'complete' && <CheckCircle2 className="w-4 h-4 text-green-400" />}
          </div>
          <p className="text-[#9898a8] text-sm">
            {state?.knowledgeGraph.brand && `Marka: ${state.knowledgeGraph.brand} · `}
            Runda {state?.currentRound ?? 0}/{state?.totalRounds ?? '?'}
            {isRunning && progress.total > 0 && ` · ${progress.current}/${progress.total} agentów`}
          </p>
          {isRunning && progress.total > 0 && (
            <div className="mt-2 space-y-1">
              <Progress value={(progress.current / progress.total) * 100} className="h-1.5 w-64" />
              <p className="text-xs text-[#52525b]">
                {Math.round((progress.current / progress.total) * 100)}%
                {progress.eta && ` · pozostało ~${progress.eta}`}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 relative">
          {status === 'complete' && id && (
            <EventInjector simId={id} onInjected={() => {}} />
          )}
          <button
            onClick={() => setChatOpen(o => !o)}
            className="flex items-center gap-2 px-3 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
        </div>
      </div>

      {/* KG chips */}
      {state?.knowledgeGraph.claims.length ? (
        <div className="flex flex-wrap gap-2">
          {state.knowledgeGraph.claims.slice(0, 4).map((c, i) => (
            <span key={i} className="px-2 py-1 bg-[#1f1f25] border border-[#38383f] rounded-full text-xs text-[#c0c0cc]">{c}</span>
          ))}
          {state.knowledgeGraph.controversialElements.slice(0, 2).map((c, i) => (
            <span key={i} className="px-2 py-1 bg-red-900/20 border border-red-800/40 rounded-full text-xs text-red-400">⚡ {c}</span>
          ))}
        </div>
      ) : null}

      {/* Frame competition charts */}
      {state && state.frames && state.frames.length > 0 && state.frameStats && state.frameStats.length > 0 && (
        <FrameCompetitionChart frames={state.frames} frameStats={state.frameStats} />
      )}

      {/* Social graph */}
      {state && state.rounds.length > 0 && (
        <SocialGraph
          population={state.population.map(p => ({ id: p.id, name: p.name }))}
          agentOpinions={state.agentOpinions}
          viralPathsByRound={state.rounds.map(r => r.viralPaths)}
          agentFrames={state.agentFrames}
          frames={state.frames}
        />
      )}

      {/* Opinion chart */}
      {chartData.length > 0 && (
        <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4 text-sm">Trajektoria opinii</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#38383f" />
              <XAxis dataKey="runda" stroke="#6b6b78" tick={{ fill: '#9898a8', fontSize: 12 }} label={{ value: 'Runda', position: 'insideBottom', fill: '#6b6b78', fontSize: 11 }} />
              <YAxis stroke="#6b6b78" tick={{ fill: '#9898a8', fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#1f1f25', border: '1px solid #38383f', borderRadius: 8, color: '#e4e4e7' }} />
              <Legend wrapperStyle={{ color: '#c0c0cc', fontSize: 12 }} />
              <Line type="monotone" dataKey="Avg opinia" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Pozytywni" stroke="#22c55e" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              <Line type="monotone" dataKey="Negatywni" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Insights (post-simulation) */}
      {status === 'complete' && state?.insights && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Distribution */}
          {dist && (
            <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-4 space-y-3">
              <h3 className="text-white font-semibold text-sm">Końcowy rozkład opinii</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-400" /><span className="text-sm text-[#c0c0cc]">Pozytywni</span></div>
                  <span className="text-green-400 font-mono text-sm">{dist.positive}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-red-400" /><span className="text-sm text-[#c0c0cc]">Negatywni</span></div>
                  <span className="text-red-400 font-mono text-sm">{dist.negative}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Minus className="w-4 h-4 text-[#9898a8]" /><span className="text-sm text-[#c0c0cc]">Neutralni</span></div>
                  <span className="text-[#9898a8] font-mono text-sm">{dist.neutral}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Coalitions */}
          {state.insights.coalitionMap.length > 0 && (
            <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-4 space-y-3">
              <h3 className="text-white font-semibold text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Koalicje</h3>
              <div className="space-y-2">
                {state.insights.coalitionMap.map((c, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-[#e4e4e7]">{c.name}</span>
                      <span className="text-xs text-[#6b6b78] ml-2">{c.dominantPoliticalAffiliation}</span>
                    </div>
                    <span className={`text-xs font-mono ${c.sentiment === 'positive' ? 'text-green-400' : c.sentiment === 'negative' ? 'text-red-400' : 'text-[#9898a8]'}`}>
                      {c.size} os.
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Influencers */}
          {state.insights.influencerPersonas.length > 0 && (
            <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-4 space-y-3">
              <h3 className="text-white font-semibold text-sm">Top influencerzy</h3>
              <div className="space-y-2">
                {state.insights.influencerPersonas.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-sm text-[#c0c0cc]">{p.personaName}</span>
                    <div className="flex items-center gap-1">
                      <div className="w-16 h-1.5 bg-[#38383f] rounded-full overflow-hidden">
                        <div className="h-full bg-[#6366f1] rounded-full" style={{ width: `${p.reachScore}%` }} />
                      </div>
                      <span className="text-xs text-[#6b6b78] w-6 text-right">{p.reachScore}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ReportAgent synthesis */}
      {status === 'complete' && state?.insights?.reportAgentSynthesis && (
        <div className="bg-[#1f1f25] border border-[#6366f1]/30 rounded-xl p-5 space-y-3">
          <h3 className="text-white font-semibold text-sm flex items-center gap-2">
            <Network className="w-4 h-4 text-[#6366f1]" /> Synteza ReportAgent
          </h3>
          <p className="text-[#c0c0cc] text-sm leading-relaxed">{state.insights.reportAgentSynthesis}</p>
          {state.insights.recommendations.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-[#38383f]">
              <p className="text-xs text-[#6b6b78] uppercase tracking-wider">Rekomendacje</p>
              {state.insights.recommendations.map((r, i) => (
                <p key={i} className="text-sm text-[#c0c0cc]">· {r}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Demographic breakdown */}
      {status === 'complete' && state?.demographicBreakdown && (
        <DemographicBreakdown data={state.demographicBreakdown} />
      )}

      {/* Rounds accordion */}
      {state && state.rounds.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-white font-semibold text-sm">Rundy</h2>
          {[...state.rounds].reverse().map((round, i) => (
            <RoundAccordion key={round.roundNumber} round={round} defaultOpen={i === 0} />
          ))}
        </div>
      )}

      {/* Running placeholder */}
      {isRunning && (!state?.rounds || state.rounds.length === 0) && (
        <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-8 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#6366f1] mx-auto" />
          <p className="text-[#c0c0cc] text-sm">Agenci wchodzą do symulacji…</p>
        </div>
      )}

      {/* Chat drawer */}
      {chatOpen && id && state && (
        <ChatDrawer simId={id} population={state.population} onClose={() => setChatOpen(false)} />
      )}
    </div>
  );
}
