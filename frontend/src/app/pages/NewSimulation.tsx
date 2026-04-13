import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Network, Loader2 } from 'lucide-react';
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

export function NewSimulation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<SimulationFormData>({
    studyName: '',
    headline: '',
    body: '',
    cta: '',
    brand: '',
    category: '',
    context: '',
    totalRounds: 5,
    platform: 'facebook',
    activeAgentRatio: 0.7,
  });

  function set(field: keyof SimulationFormData, value: any) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.headline || !form.body || !form.cta) {
      setError('Wypełnij wymagane pola: Headline, Body, CTA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const id = await startSimulation(form);
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
          <h1 className="text-2xl font-bold text-white">Symulacja społeczna v2</h1>
        </div>
        <p className="text-[#a1a1aa] text-sm">
          Multi-rundowa symulacja jak reklama rozprzestrzenia się przez sieć społeczną polskich personas.
          Agenci pamiętają poprzednie rundy, dyskutują, komentują i zmieniają opinie.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Materiał reklamowy */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Materiał reklamowy</h2>

          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Nazwa badania</label>
            <input
              type="text"
              value={form.studyName}
              onChange={(e) => set('studyName', e.target.value)}
              placeholder="np. Kampania T-Mobile Q2 2026"
              className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Headline *</label>
            <input
              type="text"
              value={form.headline}
              onChange={(e) => set('headline', e.target.value)}
              placeholder="Główny nagłówek reklamy"
              className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">Body *</label>
            <textarea
              value={form.body}
              onChange={(e) => set('body', e.target.value)}
              placeholder="Treść reklamy"
              rows={4}
              className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1] resize-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs text-[#a1a1aa] mb-1">CTA *</label>
            <input
              type="text"
              value={form.cta}
              onChange={(e) => set('cta', e.target.value)}
              placeholder="Call to action"
              className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Marka</label>
              <input
                type="text"
                value={form.brand}
                onChange={(e) => set('brand', e.target.value)}
                placeholder="np. T-Mobile"
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#a1a1aa] mb-1">Kategoria</label>
              <select
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
                className="w-full bg-[#09090b] border border-[#3f3f46] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Parametry symulacji */}
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6 space-y-4">
          <h2 className="text-white font-semibold">Parametry symulacji</h2>

          <div>
            <label className="block text-xs text-[#a1a1aa] mb-2">
              Liczba rund: <span className="text-white font-semibold">{form.totalRounds}</span>
            </label>
            <input
              type="range"
              min={3}
              max={15}
              value={form.totalRounds}
              onChange={(e) => set('totalRounds', Number(e.target.value))}
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
                  onClick={() => set('platform', p)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.platform === p
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
              Aktywni agenci per runda: <span className="text-white font-semibold">{Math.round((form.activeAgentRatio ?? 0.7) * 100)}%</span>
            </label>
            <input
              type="range"
              min={30}
              max={100}
              step={10}
              value={Math.round((form.activeAgentRatio ?? 0.7) * 100)}
              onChange={(e) => set('activeAgentRatio', Number(e.target.value) / 100)}
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
              Uruchom symulację
            </>
          )}
        </button>
      </form>
    </div>
  );
}
