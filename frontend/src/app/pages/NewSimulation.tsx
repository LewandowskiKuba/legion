import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Network, Loader2, Megaphone, Globe } from 'lucide-react';
import { startSimulation, type SimulationFormData } from '../utils/api';

const CATEGORIES = [
  { value: '', label: '– dowolna –' },
  { value: 'fmcg', label: 'FMCG' },
  { value: 'electronics', label: 'Elektronika' },
  { value: 'fashion', label: 'Moda' },
  { value: 'financial_services', label: 'Usługi finansowe' },
  { value: 'automotive', label: 'Motoryzacja' },
  { value: 'food_delivery', label: 'Dostawa jedzenia' },
  { value: 'travel', label: 'Podróże' },
  { value: 'healthcare', label: 'Zdrowie' },
  { value: 'entertainment', label: 'Rozrywka' },
  { value: 'home_appliances', label: 'AGD/RTV' },
  { value: 'beauty', label: 'Uroda' },
];

const TOPIC_EXAMPLES = [
  'Iran blokuje Cieśninę Ormuz, ceny ropy skaczą o 40%',
  'Rząd ogłasza podwyżkę podatku VAT do 25% od 2027',
  'NBP podnosi stopy procentowe do 10% — raty kredytów rosną',
  'Polska wchodzi do strefy euro — kurs wymiany 1 EUR = 4,30 PLN',
  'Ogłoszono masowe zwolnienia w sektorze automotive — 50 000 etatów',
];

type SeedType = 'ad' | 'topic';

interface CommonFields {
  studyName: string;
  totalRounds: number;
  platform: 'facebook' | 'twitter';
  activeAgentRatio: number;
}

interface AdFields {
  headline: string;
  body: string;
  cta: string;
  brand: string;
  category: string;
}

interface TopicFields {
  query: string;
  context: string;
  expectedImpacts: string;
}

export function NewSimulation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedType, setSeedType] = useState<SeedType>('ad');

  const [common, setCommon] = useState<CommonFields>({
    studyName: '',
    totalRounds: 5,
    platform: 'facebook',
    activeAgentRatio: 0.7,
  });

  const [ad, setAd] = useState<AdFields>({
    headline: '',
    body: '',
    cta: '',
    brand: '',
    category: '',
  });

  const [topic, setTopic] = useState<TopicFields>({
    query: '',
    context: '',
    expectedImpacts: '',
  });

  function setC(field: keyof CommonFields, value: any) {
    setCommon((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (seedType === 'ad') {
      if (!ad.headline || !ad.body || !ad.cta) {
        setError('Wypełnij wymagane pola: Headline, Body, CTA');
        return;
      }
    } else {
      if (!topic.query.trim()) {
        setError('Opisz scenariusz (pole Scenariusz jest wymagane)');
        return;
      }
    }

    setLoading(true);
    try {
      let data: SimulationFormData;
      if (seedType === 'ad') {
        data = {
          seedType: 'ad',
          studyName: common.studyName || `${ad.brand || 'Reklama'} – ${ad.headline.slice(0, 30)}`,
          headline: ad.headline,
          body: ad.body,
          cta: ad.cta,
          brand: ad.brand || undefined,
          category: ad.category || undefined,
          totalRounds: common.totalRounds,
          platform: common.platform,
          activeAgentRatio: common.activeAgentRatio,
        };
      } else {
        const impacts = topic.expectedImpacts
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        data = {
          seedType: 'topic',
          studyName: common.studyName || topic.query.slice(0, 50),
          query: topic.query,
          context: topic.context || undefined,
          expectedImpacts: impacts.length ? impacts : undefined,
          totalRounds: common.totalRounds,
          platform: common.platform,
          activeAgentRatio: common.activeAgentRatio,
        };
      }
      const id = await startSimulation(data);
      navigate(`/simulation/${id}`);
    } catch (err: any) {
      setError(err.message ?? 'Błąd startu symulacji');
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Network className="w-7 h-7 text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Nowa symulacja</h1>
        </div>
        <p className="text-[#a1a1aa] text-sm">
          Multi-rundowa symulacja społeczna. Testuj reklamy lub analizuj jak polskie społeczeństwo
          reaguje na dowolne wydarzenie — gospodarcze, polityczne, społeczne.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Toggle: Reklama / Scenariusz */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-2 flex gap-2">
          <button
            type="button"
            onClick={() => setSeedType('ad')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              seedType === 'ad'
                ? 'bg-[#6366f1] text-white'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            <Megaphone className="w-4 h-4" />
            Reklama
          </button>
          <button
            type="button"
            onClick={() => setSeedType('topic')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              seedType === 'topic'
                ? 'bg-[#6366f1] text-white'
                : 'text-[#a1a1aa] hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4" />
            Scenariusz / Event
          </button>
        </div>

        {/* Pola dla trybu "Reklama" */}
        {seedType === 'ad' && (
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Materiał reklamowy</h2>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Nazwa badania</label>
              <input
                type="text"
                value={common.studyName}
                onChange={(e) => setC('studyName', e.target.value)}
                placeholder="np. Kampania T-Mobile Q2 2026"
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Headline *</label>
              <input
                type="text"
                value={ad.headline}
                onChange={(e) => setAd((f) => ({ ...f, headline: e.target.value }))}
                placeholder="Główny nagłówek reklamy"
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Body *</label>
              <textarea
                value={ad.body}
                onChange={(e) => setAd((f) => ({ ...f, body: e.target.value }))}
                placeholder="Treść reklamy"
                rows={4}
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1] resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">CTA *</label>
              <input
                type="text"
                value={ad.cta}
                onChange={(e) => setAd((f) => ({ ...f, cta: e.target.value }))}
                placeholder="Call to action"
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Marka</label>
                <input
                  type="text"
                  value={ad.brand}
                  onChange={(e) => setAd((f) => ({ ...f, brand: e.target.value }))}
                  placeholder="np. T-Mobile"
                  className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a1a1aa] mb-1">Kategoria</label>
                <select
                  value={ad.category}
                  onChange={(e) => setAd((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Pola dla trybu "Scenariusz" */}
        {seedType === 'topic' && (
          <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-4">
            <h2 className="text-white font-semibold">Scenariusz / Wydarzenie</h2>
            <p className="text-[#71717a] text-xs">
              Opisz wydarzenie — gospodarcze, polityczne, społeczne. Agenci zareagują z perspektywy
              swojej sytuacji życiowej, wartości i poglądów.
            </p>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Nazwa symulacji</label>
              <input
                type="text"
                value={common.studyName}
                onChange={(e) => setC('studyName', e.target.value)}
                placeholder="np. Scenariusz: blokada Ormuz"
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Scenariusz *</label>
              <textarea
                value={topic.query}
                onChange={(e) => setTopic((f) => ({ ...f, query: e.target.value }))}
                placeholder="Opisz wydarzenie. Np.: Iran blokuje Cieśninę Ormuz. Ceny ropy skaczą o 40% w ciągu tygodnia. Eksperci przewidują recesję w EU."
                rows={4}
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1] resize-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {TOPIC_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setTopic((f) => ({ ...f, query: ex }))}
                    className="text-xs bg-[#27272a] hover:bg-[#3f3f46] text-[#a1a1aa] hover:text-white px-2 py-1 rounded transition-colors"
                  >
                    {ex.slice(0, 40)}…
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Kontekst (opcjonalnie)</label>
              <textarea
                value={topic.context}
                onChange={(e) => setTopic((f) => ({ ...f, context: e.target.value }))}
                placeholder="Dodatkowy kontekst historyczny, dane, tło wydarzenia..."
                rows={2}
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1] resize-none"
              />
            </div>

            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">
                Przewidywane skutki (opcjonalnie, jeden per linię)
              </label>
              <textarea
                value={topic.expectedImpacts}
                onChange={(e) => setTopic((f) => ({ ...f, expectedImpacts: e.target.value }))}
                placeholder={"Wzrost cen paliw o 30%\nZwolnienia w transporcie\nInflacja powróci do 15%"}
                rows={3}
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1] resize-none font-mono"
              />
            </div>
          </div>
        )}

        {/* Parametry symulacji */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Parametry symulacji</h2>

          <div>
            <label className="block text-xs text-[#a1a1aa] mb-2">
              Liczba rund: <span className="text-white font-semibold">{common.totalRounds}</span>
            </label>
            <input
              type="range"
              min={3}
              max={15}
              value={common.totalRounds}
              onChange={(e) => setC('totalRounds', Number(e.target.value))}
              className="w-full accent-[#6366f1]"
            />
            <div className="flex justify-between text-xs text-[#52525b] mt-1">
              <span>3 rundy (szybko)</span>
              <span>15 rund (szczegółowo)</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#a1a1aa] mb-2">Platforma</label>
            <div className="flex gap-3">
              {(['facebook', 'twitter'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setC('platform', p)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    common.platform === p
                      ? 'bg-[#6366f1] border-[#6366f1] text-white'
                      : 'bg-[#09090b] border-[#3f3f46] text-[#a1a1aa] hover:border-[#6366f1]'
                  }`}
                >
                  {p === 'facebook' ? 'Facebook' : 'Twitter/X'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#a1a1aa] mb-2">
              Aktywni agenci per runda:{' '}
              <span className="text-white font-semibold">{Math.round(common.activeAgentRatio * 100)}%</span>
            </label>
            <input
              type="range"
              min={30}
              max={100}
              step={10}
              value={Math.round(common.activeAgentRatio * 100)}
              onChange={(e) => setC('activeAgentRatio', Number(e.target.value) / 100)}
              className="w-full accent-[#6366f1]"
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Inicjalizuję symulację...
            </>
          ) : (
            <>
              <Network className="w-4 h-4" />
              {seedType === 'topic' ? 'Uruchom predykcję społeczną' : 'Uruchom symulację reklamy'}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
