import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Network, Loader2, Megaphone, Globe, MessageSquare, ImagePlus, X, Filter } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  startSimulation,
  startAbTest,
  startSegmentCompare,
  uploadCreative,
  getBrands,
  mockCategories,
  type AdSimulationFormData,
  type RumorSimulationFormData,
  type TopicSimulationFormData,
  type FramesSimulationFormData,
  type Frame,
  type PopFilter,
} from '../utils/api';

// ─── Stałe ───────────────────────────────────────────────────────────────────

const TOPIC_EXAMPLES = [
  'Iran blokuje Cieśninę Ormuz, ceny ropy skaczą o 40%',
  'Rząd ogłasza podwyżkę podatku VAT do 25% od 2027',
  'NBP podnosi stopy procentowe do 10% — raty kredytów rosną',
  'Polska wchodzi do strefy euro — kurs wymiany 1 EUR = 4,30 PLN',
  'Ogłoszono masowe zwolnienia w sektorze automotive — 50 000 etatów',
];

type SeedTab = 'ad' | 'rumor' | 'topic';
type AdMode = 'single' | 'ab' | 'segment';
type TopicMode = 'single' | 'frames';

// ─── CreativeState & Uploader (poza komponentem – unika remount) ─────────────

interface CreativeState {
  file: File | null;
  preview: string | null;
  id: string | null;
  uploading: boolean;
  error: string | null;
}

const emptyCreative = (): CreativeState => ({
  file: null, preview: null, id: null, uploading: false, error: null,
});

function CreativeUploader({
  state,
  onChange,
  label = 'Kreacja graficzna',
}: {
  state: CreativeState;
  onChange: (s: CreativeState | ((prev: CreativeState) => CreativeState)) => void;
  label?: string;
}) {
  const handleSelect = async (file: File) => {
    onChange({ ...emptyCreative(), file, preview: URL.createObjectURL(file), uploading: true });
    try {
      const id = await uploadCreative(file);
      onChange((prev) => ({ ...prev, id, uploading: false }));
    } catch (err: any) {
      onChange((prev) => ({ ...prev, error: err.message ?? 'Błąd uploadu', uploading: false }));
    }
  };

  const handleClear = () => onChange(emptyCreative());

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <ImagePlus className="w-4 h-4 text-[#6366f1]" />
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-xs text-[#6b6b78] ml-1">(opcjonalnie – JPG, PNG, WEBP)</span>
      </div>

      {!state.file ? (
        <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-[#52525a] rounded-lg cursor-pointer hover:border-[#6366f1] transition-colors">
          <ImagePlus className="w-5 h-5 text-[#9898a8] mb-1" />
          <span className="text-xs text-[#9898a8]">Kliknij lub przeciągnij plik</span>
          <input
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSelect(f); }}
          />
        </label>
      ) : (
        <div className="flex items-start gap-3">
          {state.preview && (
            <img src={state.preview} alt="podgląd" className="h-20 rounded-lg object-contain bg-[#0f0f11]" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white truncate">{state.file.name}</span>
              <button type="button" onClick={handleClear} className="text-[#6b6b78] hover:text-white flex-shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
            {state.uploading && (
              <div className="flex items-center gap-1 mt-1">
                <Loader2 className="w-3 h-3 text-[#6366f1] animate-spin" />
                <span className="text-xs text-[#c0c0cc]">Przesyłanie...</span>
              </div>
            )}
            {state.id && !state.uploading && (
              <span className="text-xs text-green-400 mt-1 block">Gotowe</span>
            )}
            {state.error && (
              <span className="text-xs text-red-400 mt-1 block">{state.error}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BrandAutocomplete ───────────────────────────────────────────────────────

function BrandAutocomplete({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim().length > 0
    ? options.filter((o) => o.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="np. T-Mobile"
        autoComplete="off"
        className="w-full bg-[#111113] border border-[#6b6b78] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1] placeholder:text-[#9898a8]"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-[#1f1f25] border border-[#38383f] rounded-lg shadow-lg overflow-hidden">
          {filtered.map((brand) => (
            <li
              key={brand}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(brand);
                setOpen(false);
              }}
              className="px-3 py-2 text-sm text-white cursor-pointer hover:bg-[#38383f] transition-colors"
            >
              {brand}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── TargetingFilters ─────────────────────────────────────────────────────────

interface TargetingState {
  gender: string;
  ageMin: string;
  ageMax: string;
  location: string;
  income: string;
}

function TargetingFilters({
  value,
  onChange,
}: {
  value: TargetingState;
  onChange: (v: TargetingState) => void;
}) {
  return (
    <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-[#6366f1]" />
        <h3 className="text-sm font-semibold text-white">Filtry segmentacji</h3>
      </div>
      <div className="grid grid-cols-5 gap-4">
        <div className="space-y-2">
          <Label className="text-white text-xs">Płeć</Label>
          <Select value={value.gender} onValueChange={(v) => onChange({ ...value, gender: v })}>
            <SelectTrigger className="bg-[#111113] border-[#6b6b78] text-white text-sm rounded-lg h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1f1f25] border-[#38383f]">
              <SelectItem value="all" className="text-white text-sm">Wszyscy</SelectItem>
              <SelectItem value="male" className="text-white text-sm">Mężczyźni</SelectItem>
              <SelectItem value="female" className="text-white text-sm">Kobiety</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-white text-xs">Wiek min</Label>
          <input
            type="number"
            value={value.ageMin}
            onChange={(e) => onChange({ ...value, ageMin: e.target.value })}
            placeholder="18"
            className="w-full bg-[#111113] border border-[#6b6b78] text-white text-sm rounded-lg h-9 px-3 focus:outline-none focus:border-[#6366f1]"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-white text-xs">Wiek max</Label>
          <input
            type="number"
            value={value.ageMax}
            onChange={(e) => onChange({ ...value, ageMax: e.target.value })}
            placeholder="65"
            className="w-full bg-[#111113] border border-[#6b6b78] text-white text-sm rounded-lg h-9 px-3 focus:outline-none focus:border-[#6366f1]"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-white text-xs">Miejscowość</Label>
          <Select value={value.location} onValueChange={(v) => onChange({ ...value, location: v })}>
            <SelectTrigger className="bg-[#111113] border-[#6b6b78] text-white text-sm rounded-lg h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1f1f25] border-[#38383f]">
              <SelectItem value="all" className="text-white text-sm">Wszystkie</SelectItem>
              <SelectItem value="urban" className="text-white text-sm">Miasta &gt;500k</SelectItem>
              <SelectItem value="suburban" className="text-white text-sm">Miasta 100-500k</SelectItem>
              <SelectItem value="rural" className="text-white text-sm">Mniejsze miasta i wieś</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-white text-xs">Dochód</Label>
          <Select value={value.income} onValueChange={(v) => onChange({ ...value, income: v })}>
            <SelectTrigger className="bg-[#111113] border-[#6b6b78] text-white text-sm rounded-lg h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#1f1f25] border-[#38383f]">
              <SelectItem value="all" className="text-white text-sm">Wszystkie</SelectItem>
              <SelectItem value="low" className="text-white text-sm">Niski</SelectItem>
              <SelectItem value="medium" className="text-white text-sm">Średni</SelectItem>
              <SelectItem value="high" className="text-white text-sm">Wysoki</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

// ─── SimulationParams (wspólne) ───────────────────────────────────────────────

interface SimParams {
  totalRounds: number;
  platform: 'facebook' | 'twitter';
  activeAgentRatio: number;
}

function SimulationParams({ value, onChange }: { value: SimParams; onChange: (v: SimParams) => void }) {
  return (
    <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6 space-y-4">
      <h2 className="text-white font-semibold">Parametry symulacji</h2>
      <div>
        <label className="block text-xs text-[#c0c0cc] mb-2">
          Liczba rund: <span className="text-white font-semibold">{value.totalRounds}</span>
        </label>
        <input
          type="range" min={3} max={15} value={value.totalRounds}
          onChange={(e) => onChange({ ...value, totalRounds: Number(e.target.value) })}
          className="w-full accent-[#6366f1]"
        />
        <div className="flex justify-between text-xs text-[#6b6b78] mt-1">
          <span>3 rundy (szybko)</span>
          <span>15 rund (szczegółowo)</span>
        </div>
      </div>
      <div>
        <label className="block text-xs text-[#c0c0cc] mb-2">Platforma</label>
        <div className="flex gap-3">
          {(['facebook', 'twitter'] as const).map((p) => (
            <button
              key={p} type="button"
              onClick={() => onChange({ ...value, platform: p })}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                value.platform === p
                  ? 'bg-[#6366f1] border-[#6366f1] text-white'
                  : 'bg-[#111113] border-[#6b6b78] text-[#c0c0cc] hover:border-[#6366f1]'
              }`}
            >
              {p === 'facebook' ? 'Facebook' : 'Twitter/X'}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs text-[#c0c0cc] mb-2">
          Aktywni agenci per runda:{' '}
          <span className="text-white font-semibold">{Math.round(value.activeAgentRatio * 100)}%</span>
        </label>
        <input
          type="range" min={30} max={100} step={10}
          value={Math.round(value.activeAgentRatio * 100)}
          onChange={(e) => onChange({ ...value, activeAgentRatio: Number(e.target.value) / 100 })}
          className="w-full accent-[#6366f1]"
        />
      </div>
    </div>
  );
}

// ─── Główny komponent ─────────────────────────────────────────────────────────

const emptyTargeting = (): TargetingState => ({
  gender: 'all', ageMin: '', ageMax: '', location: 'all', income: 'all',
});

const defaultParams = (): SimParams => ({
  totalRounds: 5, platform: 'facebook', activeAgentRatio: 0.7,
});

export function NewSimulation() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<SeedTab>('ad');
  const [brands, setBrands] = useState<string[]>([]);

  useEffect(() => {
    getBrands().then(setBrands).catch(() => {});
  }, []);

  // Wspólne parametry
  const [params, setParams] = useState<SimParams>(defaultParams());

  // ── Zakładka Reklama ──
  const [adStudyName, setAdStudyName] = useState('');
  const [adHeadline, setAdHeadline] = useState('');
  const [adBody, setAdBody] = useState('');
  const [adCta, setAdCta] = useState('');
  const [adBrand, setAdBrand] = useState('');
  const [adCategory, setAdCategory] = useState('');
  const [adContext, setAdContext] = useState('');
  const [adMode, setAdMode] = useState<AdMode>('single');
  const [adTargetingFilters, setAdTargetingFilters] = useState<TargetingState>(emptyTargeting());
  const [adSegmentALabel, setAdSegmentALabel] = useState('Segment A');
  const [adSegmentBLabel, setAdSegmentBLabel] = useState('Segment B');
  const [adSegmentBFilters, setAdSegmentBFilters] = useState<TargetingState>(emptyTargeting());
  const [creativeA, setCreativeA] = useState<CreativeState>(emptyCreative());
  // Wariant B
  const [adHeadlineB, setAdHeadlineB] = useState('');
  const [adBodyB, setAdBodyB] = useState('');
  const [adCtaB, setAdCtaB] = useState('');
  const [creativeB, setCreativeB] = useState<CreativeState>(emptyCreative());

  // ── Zakładka Komunikat/Plotka ──
  const [rumorStudyName, setRumorStudyName] = useState('');
  const [rumorHeadline, setRumorHeadline] = useState('');
  const [rumorBody, setRumorBody] = useState('');
  const [rumorBrand, setRumorBrand] = useState('');
  const [rumorContext, setRumorContext] = useState('');
  const [rumorTargeting, setRumorTargeting] = useState(false);
  const [rumorTargetingFilters, setRumorTargetingFilters] = useState<TargetingState>(emptyTargeting());
  const [rumorCreative, setRumorCreative] = useState<CreativeState>(emptyCreative());

  // ── Zakładka Scenariusz ──
  const [topicStudyName, setTopicStudyName] = useState('');
  const [topicQuery, setTopicQuery] = useState('');
  const [topicContext, setTopicContext] = useState('');
  const [topicImpacts, setTopicImpacts] = useState('');
  const [topicMode, setTopicMode] = useState<TopicMode>('single');

  // ── Tryb Competitive Contagion (podzakładka Scenariusza) ──
  const [framesStudyName, setFramesStudyName] = useState('');
  const [frames, setFrames] = useState<Frame[]>([
    { id: 'f1', label: '', text: '' },
    { id: 'f2', label: '', text: '' },
  ]);

  const anyUploading = creativeA.uploading || creativeB.uploading || rumorCreative.uploading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (tab === 'ad') {
      if (!adHeadline && !creativeA.id) {
        setError(adMode === 'single' ? 'Podaj Headline lub wgraj kreację graficzną' : 'Wariant A: podaj Headline lub wgraj kreację graficzną');
        return;
      }
      if (adMode === 'ab' && !adHeadlineB && !creativeB.id) {
        setError('Wariant B: podaj Headline lub wgraj kreację graficzną');
        return;
      }
      setLoading(true);
      try {
        const studyName = adStudyName || `${adBrand || 'Reklama'} – ${adHeadline.slice(0, 30)}`;
        const commonAd = {
          headline: adHeadline || undefined,
          body: adBody || undefined,
          cta: adCta || undefined,
          brand: adBrand || undefined,
          category: adCategory || undefined,
          context: adContext || undefined,
          creativeId: creativeA.id || undefined,
        };
        const sharedFilter: PopFilter = {
          gender: adTargetingFilters.gender !== 'all' ? adTargetingFilters.gender : undefined,
          ageMin: adTargetingFilters.ageMin ? Number(adTargetingFilters.ageMin) : undefined,
          ageMax: adTargetingFilters.ageMax ? Number(adTargetingFilters.ageMax) : undefined,
          settlement: adTargetingFilters.location !== 'all' ? adTargetingFilters.location : undefined,
          income: adTargetingFilters.income !== 'all' ? adTargetingFilters.income : undefined,
        };

        if (adMode === 'ab') {
          const adB = {
            headline: adHeadlineB || adHeadline || undefined,
            body: adBodyB || adBody || undefined,
            cta: adCtaB || adCta || undefined,
            brand: adBrand || undefined,
            category: adCategory || undefined,
            context: adContext || undefined,
            creativeId: creativeB.id || creativeA.id || undefined,
          };
          const { idA, idB } = await startAbTest({
            studyName,
            adA: commonAd,
            adB,
            filter: sharedFilter,
            totalRounds: params.totalRounds,
            platform: params.platform,
            activeAgentRatio: params.activeAgentRatio,
          });
          navigate(`/simulation/compare/${idA}/${idB}`);

        } else if (adMode === 'segment') {
          const toFilter = (s: TargetingState): PopFilter => ({
            gender: s.gender !== 'all' ? s.gender : undefined,
            ageMin: s.ageMin ? Number(s.ageMin) : undefined,
            ageMax: s.ageMax ? Number(s.ageMax) : undefined,
            settlement: s.location !== 'all' ? s.location : undefined,
            income: s.income !== 'all' ? s.income : undefined,
          });
          const { idA, idB } = await startSegmentCompare({
            studyName,
            ad: commonAd,
            segmentA: { label: adSegmentALabel || 'Segment A', filter: toFilter(adTargetingFilters) },
            segmentB: { label: adSegmentBLabel || 'Segment B', filter: toFilter(adSegmentBFilters) },
            totalRounds: params.totalRounds,
            platform: params.platform,
            activeAgentRatio: params.activeAgentRatio,
          });
          navigate(`/simulation/compare/${idA}/${idB}`);

        } else {
          const baseAd: AdSimulationFormData = {
            seedType: 'ad',
            studyName,
            ...commonAd,
            totalRounds: params.totalRounds,
            platform: params.platform,
            activeAgentRatio: params.activeAgentRatio,
            filterGender: sharedFilter.gender,
            filterAgeMin: sharedFilter.ageMin?.toString(),
            filterAgeMax: sharedFilter.ageMax?.toString(),
            filterSettlement: sharedFilter.settlement,
            filterIncome: sharedFilter.income,
          };
          const id = await startSimulation(baseAd);
          navigate(`/simulation/${id}`);
        }
      } catch (err: any) {
        setError(err.message ?? 'Błąd startu symulacji');
        setLoading(false);
      }
    } else if (tab === 'rumor') {
      if (!rumorBody.trim()) {
        setError('Treść komunikatu jest wymagana');
        return;
      }
      setLoading(true);
      try {
        const data: RumorSimulationFormData = {
          seedType: 'rumor',
          studyName: rumorStudyName || rumorBody.slice(0, 50),
          headline: rumorHeadline || undefined,
          body: rumorBody,
          brand: rumorBrand || undefined,
          context: rumorContext || undefined,
          creativeId: rumorCreative.id || undefined,
          totalRounds: params.totalRounds,
          platform: params.platform,
          activeAgentRatio: params.activeAgentRatio,
          filterGender: rumorTargeting ? rumorTargetingFilters.gender : undefined,
          filterAgeMin: rumorTargeting ? rumorTargetingFilters.ageMin : undefined,
          filterAgeMax: rumorTargeting ? rumorTargetingFilters.ageMax : undefined,
          filterSettlement: rumorTargeting ? rumorTargetingFilters.location : undefined,
          filterIncome: rumorTargeting ? rumorTargetingFilters.income : undefined,
        };
        const id = await startSimulation(data);
        navigate(`/simulation/${id}`);
      } catch (err: any) {
        setError(err.message ?? 'Błąd startu symulacji');
        setLoading(false);
      }
    } else {
      if (topicMode === 'frames') {
        const validFrames = frames.filter(f => f.label.trim() && f.text.trim());
        if (validFrames.length < 2) {
          setError('Podaj co najmniej 2 framings (etykieta + treść)');
          return;
        }
        setLoading(true);
        try {
          const data: FramesSimulationFormData = {
            seedType: 'frames',
            studyName: framesStudyName || `WoM: ${validFrames.map(f => f.label).join(' vs ')}`.slice(0, 60),
            frames: validFrames,
            totalRounds: params.totalRounds,
            platform: params.platform,
            activeAgentRatio: params.activeAgentRatio,
          };
          const id = await startSimulation(data);
          navigate(`/simulation/${id}`);
        } catch (err: any) {
          setError(err.message ?? 'Błąd startu symulacji');
          setLoading(false);
        }
        return;
      }

      if (!topicQuery.trim()) {
        setError('Opisz scenariusz (pole Scenariusz jest wymagane)');
        return;
      }
      setLoading(true);
      try {
        const impacts = topicImpacts.split('\n').map((s) => s.trim()).filter(Boolean);
        const data: TopicSimulationFormData = {
          seedType: 'topic',
          studyName: topicStudyName || topicQuery.slice(0, 50),
          query: topicQuery,
          context: topicContext || undefined,
          expectedImpacts: impacts.length ? impacts : undefined,
          totalRounds: params.totalRounds,
          platform: params.platform,
          activeAgentRatio: params.activeAgentRatio,
        };
        const id = await startSimulation(data);
        navigate(`/simulation/${id}`);
      } catch (err: any) {
        setError(err.message ?? 'Błąd startu symulacji');
        setLoading(false);
      }
    }
  }

  const inputCls = "w-full bg-[#111113] border border-[#6b6b78] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1] placeholder:text-[#9898a8]";

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Network className="w-7 h-7 text-[#6366f1]" />
          <h1 className="text-2xl font-bold text-white">Nowa symulacja</h1>
        </div>
        <p className="text-[#c0c0cc] text-sm">
          Multi-rundowa symulacja społeczna. Testuj reklamy, komunikaty lub analizuj jak polskie
          społeczeństwo reaguje na dowolne wydarzenie.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* Toggle zakładek */}
        <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-2 flex gap-2">
          {([
            { key: 'ad' as SeedTab, icon: Megaphone, label: 'Reklama' },
            { key: 'rumor' as SeedTab, icon: MessageSquare, label: 'Komunikat / Plotka' },
            { key: 'topic' as SeedTab, icon: Globe, label: 'Scenariusz / Event' },
          ]).map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-[#6366f1] text-white'
                  : 'text-[#c0c0cc] hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Zakładka: Reklama ── */}
        {tab === 'ad' && (
          <>
            {/* Mode selector */}
            <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-2 flex gap-2">
              {([
                { key: 'single' as AdMode, label: 'Pojedyncze badanie', desc: 'Jedna kreacja, jedna populacja' },
                { key: 'ab' as AdMode, label: 'Test A/B', desc: 'Dwie kreacje, ta sama populacja' },
                { key: 'segment' as AdMode, label: 'Porównanie segmentów', desc: 'Jedna kreacja, dwa segmenty' },
              ]).map(({ key, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAdMode(key)}
                  className={`flex-1 flex flex-col items-center py-3 px-2 rounded-lg text-sm font-medium transition-colors ${
                    adMode === key
                      ? 'bg-[#6366f1] text-white'
                      : 'text-[#c0c0cc] hover:text-white hover:bg-[#2a2a32]'
                  }`}
                >
                  <span className="font-semibold">{label}</span>
                  <span className={`text-xs mt-0.5 ${adMode === key ? 'text-indigo-200' : 'text-[#6b6b78]'}`}>{desc}</span>
                </button>
              ))}
            </div>

            {/* Targeting — widoczny tylko w single i ab */}
            {adMode !== 'segment' && (
              <TargetingFilters value={adTargetingFilters} onChange={setAdTargetingFilters} />
            )}

            {/* Panele wariantów */}
            {adMode === 'single' ? (
              <>
                {/* Kreacja */}
                <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-5">
                  <CreativeUploader state={creativeA} onChange={setCreativeA} />
                </div>

                {/* Pola wariantu A */}
                <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6 space-y-4">
                  <h2 className="text-white font-semibold">Materiał reklamowy</h2>

                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">Nazwa badania</label>
                    <input
                      type="text" value={adStudyName} onChange={(e) => setAdStudyName(e.target.value)}
                      placeholder="np. Kampania T-Mobile Q2 2026" className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">
                      Headline{creativeA.id && !adHeadline && (
                        <span className="text-[#6b6b78] font-normal ml-1">(opcjonalnie — KV wystarczy do testu)</span>
                      )}
                    </label>
                    <input
                      type="text" value={adHeadline} onChange={(e) => setAdHeadline(e.target.value)}
                      placeholder={creativeA.id ? 'Opcjonalnie – KV wystarczy...' : 'Główny nagłówek reklamy'}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">Body</label>
                    <textarea
                      value={adBody} onChange={(e) => setAdBody(e.target.value)}
                      placeholder="Treść reklamy" rows={4}
                      className={`${inputCls} resize-none`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">CTA</label>
                    <input
                      type="text" value={adCta} onChange={(e) => setAdCta(e.target.value)}
                      placeholder="Call to action" className={inputCls}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Marka</label>
                      <BrandAutocomplete value={adBrand} onChange={setAdBrand} options={brands} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Kategoria</label>
                      <select
                        value={adCategory} onChange={(e) => setAdCategory(e.target.value)}
                        className="w-full bg-[#111113] border border-[#6b6b78] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
                      >
                        <option value="">– dowolna –</option>
                        {mockCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">Kontekst ekspozycji</label>
                    <input
                      type="text" value={adContext} onChange={(e) => setAdContext(e.target.value)}
                      placeholder="np. Facebook Feed, Ocena ogólna KV..."
                      list="contexts-datalist" className={inputCls}
                    />
                    <datalist id="contexts-datalist">
                      <option value="Ocena ogólna KV" />
                      <option value="Billboard / outdoor" />
                      <option value="Opakowanie produktu" />
                      <option value="Facebook Feed" />
                      <option value="Instagram Stories" />
                      <option value="YouTube Pre-roll" />
                      <option value="TikTok In-Feed" />
                      <option value="Desktop Display" />
                      <option value="Mobile Banner" />
                      <option value="LinkedIn Sponsored" />
                      <option value="Pre-roll radio online" />
                    </datalist>
                  </div>
                </div>
              </>
            ) : adMode === 'ab' ? (
              /* Tryb A/B: dwie kreacje, ta sama populacja */
              <div className="grid grid-cols-2 gap-6">
                {/* Wariant A */}
                <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full bg-[#6366f1]" />
                    <span className="text-sm font-semibold text-white">Wariant A</span>
                  </div>
                  <CreativeUploader state={creativeA} onChange={setCreativeA} label="KV / Grafika A" />
                  <div className="border-t border-[#38383f] pt-4 space-y-4">
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Nazwa badania</label>
                      <input
                        type="text" value={adStudyName} onChange={(e) => setAdStudyName(e.target.value)}
                        placeholder="np. Kampania T-Mobile Q2 2026" className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Headline A</label>
                      <input
                        type="text" value={adHeadline} onChange={(e) => setAdHeadline(e.target.value)}
                        placeholder="Nagłówek wariantu A" className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Body A</label>
                      <textarea
                        value={adBody} onChange={(e) => setAdBody(e.target.value)}
                        placeholder="Treść wariantu A" rows={3}
                        className={`${inputCls} resize-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">CTA A</label>
                      <input
                        type="text" value={adCta} onChange={(e) => setAdCta(e.target.value)}
                        placeholder="CTA wariantu A" className={inputCls}
                      />
                    </div>
                  </div>
                </div>

                {/* Wariant B */}
                <div className="bg-[#1f1f25] border border-[#f59e0b]/30 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                    <span className="text-sm font-semibold text-white">Wariant B</span>
                  </div>
                  <CreativeUploader state={creativeB} onChange={setCreativeB} label="KV / Grafika B" />
                  <div className="border-t border-[#38383f] pt-4 space-y-4">
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Marka</label>
                      <BrandAutocomplete value={adBrand} onChange={setAdBrand} options={brands} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Headline B</label>
                      <input
                        type="text" value={adHeadlineB} onChange={(e) => setAdHeadlineB(e.target.value)}
                        placeholder="Nagłówek wariantu B" className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Body B</label>
                      <textarea
                        value={adBodyB} onChange={(e) => setAdBodyB(e.target.value)}
                        placeholder="Treść wariantu B" rows={3}
                        className={`${inputCls} resize-none`}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">CTA B</label>
                      <input
                        type="text" value={adCtaB} onChange={(e) => setAdCtaB(e.target.value)}
                        placeholder="CTA wariantu B" className={inputCls}
                      />
                    </div>
                  </div>
                </div>

                {/* Wspólne pola dla A/B */}
                <div className="col-span-2 bg-[#1f1f25] border border-[#38383f] rounded-xl p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white text-[#c0c0cc]">Wspólne ustawienia</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Kategoria</label>
                      <select
                        value={adCategory} onChange={(e) => setAdCategory(e.target.value)}
                        className="w-full bg-[#111113] border border-[#6b6b78] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]"
                      >
                        <option value="">– dowolna –</option>
                        {mockCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-xs text-[#c0c0cc] mb-1">Kontekst ekspozycji</label>
                      <input
                        type="text" value={adContext} onChange={(e) => setAdContext(e.target.value)}
                        placeholder="np. Facebook Feed..." list="contexts-datalist-ab" className={inputCls}
                      />
                      <datalist id="contexts-datalist-ab">
                        <option value="Facebook Feed" />
                        <option value="Instagram Stories" />
                        <option value="YouTube Pre-roll" />
                        <option value="TikTok In-Feed" />
                        <option value="Desktop Display" />
                        <option value="Mobile Banner" />
                      </datalist>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Tryb Segmenty: jedna kreacja, dwa panele targetowania */
              <>
                <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6 space-y-4">
                  <h2 className="text-white font-semibold">Materiał reklamowy</h2>
                  <CreativeUploader state={creativeA} onChange={setCreativeA} />
                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">Nazwa badania</label>
                    <input type="text" value={adStudyName} onChange={(e) => setAdStudyName(e.target.value)}
                      placeholder="np. Kampania T-Mobile Q2 2026 – segmenty" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">Headline</label>
                    <input type="text" value={adHeadline} onChange={(e) => setAdHeadline(e.target.value)}
                      placeholder="Główny nagłówek reklamy" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">Body</label>
                    <textarea value={adBody} onChange={(e) => setAdBody(e.target.value)}
                      placeholder="Treść reklamy" rows={3} className={`${inputCls} resize-none`} />
                  </div>
                  <div>
                    <label className="block text-xs text-[#c0c0cc] mb-1">CTA</label>
                    <input type="text" value={adCta} onChange={(e) => setAdCta(e.target.value)}
                      placeholder="Call to action" className={inputCls} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Marka</label>
                      <BrandAutocomplete value={adBrand} onChange={setAdBrand} options={brands} />
                    </div>
                    <div>
                      <label className="block text-xs text-[#c0c0cc] mb-1">Kategoria</label>
                      <select value={adCategory} onChange={(e) => setAdCategory(e.target.value)}
                        className="w-full bg-[#111113] border border-[#6b6b78] rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:border-[#6366f1]">
                        <option value="">– dowolna –</option>
                        {mockCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Dwa segmenty */}
                <div className="grid grid-cols-2 gap-6">
                  {/* Segment A */}
                  <div className="bg-[#1f1f25] border border-[#6366f1]/40 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#6366f1]" />
                      <input
                        type="text" value={adSegmentALabel} onChange={(e) => setAdSegmentALabel(e.target.value)}
                        className="text-sm font-semibold text-white bg-transparent border-none outline-none w-full"
                        placeholder="Nazwa segmentu A"
                      />
                    </div>
                    <TargetingFilters value={adTargetingFilters} onChange={setAdTargetingFilters} />
                  </div>

                  {/* Segment B */}
                  <div className="bg-[#1f1f25] border border-[#f59e0b]/40 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-[#f59e0b]" />
                      <input
                        type="text" value={adSegmentBLabel} onChange={(e) => setAdSegmentBLabel(e.target.value)}
                        className="text-sm font-semibold text-white bg-transparent border-none outline-none w-full"
                        placeholder="Nazwa segmentu B"
                      />
                    </div>
                    <TargetingFilters value={adSegmentBFilters} onChange={setAdSegmentBFilters} />
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Zakładka: Komunikat / Plotka ── */}
        {tab === 'rumor' && (
          <>
            <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-5">
              <div className="flex items-center gap-3">
                <Switch checked={rumorTargeting} onCheckedChange={setRumorTargeting} className="data-[state=checked]:bg-[#6366f1]" />
                <div>
                  <div className="text-sm font-medium text-white">Targeting</div>
                  <div className="text-xs text-[#c0c0cc]">Ogranicz do wybranej grupy</div>
                </div>
              </div>
            </div>

            {rumorTargeting && (
              <TargetingFilters value={rumorTargetingFilters} onChange={setRumorTargetingFilters} />
            )}

            <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-5">
              <CreativeUploader state={rumorCreative} onChange={setRumorCreative} label="Ilustracja / zrzut ekranu (opcjonalnie)" />
            </div>

            <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6 space-y-4">
              <h2 className="text-white font-semibold">Komunikat / Plotka</h2>
              <p className="text-[#9898a8] text-xs">
                Zasymuluj jak agenci reagują na komunikat, plotkę lub fake news w sieci społecznej.
              </p>

              <div>
                <label className="block text-xs text-[#c0c0cc] mb-1">Nazwa badania</label>
                <input
                  type="text" value={rumorStudyName} onChange={(e) => setRumorStudyName(e.target.value)}
                  placeholder="np. Plotka o bankructwie banku X" className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-[#c0c0cc] mb-1">Nagłówek / Źródło (opcjonalnie)</label>
                <input
                  type="text" value={rumorHeadline} onChange={(e) => setRumorHeadline(e.target.value)}
                  placeholder='np. "Anonimowe źródło twierdzi...", "Viral w sieci:"'
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-xs text-[#c0c0cc] mb-1">Treść komunikatu *</label>
                <textarea
                  value={rumorBody} onChange={(e) => setRumorBody(e.target.value)}
                  placeholder="Wpisz treść komunikatu, plotki lub fake newsa..."
                  rows={5} className={`${inputCls} resize-none`}
                />
              </div>
              <div>
                <label className="block text-xs text-[#c0c0cc] mb-1">Marka / podmiot (opcjonalnie)</label>
                <BrandAutocomplete value={rumorBrand} onChange={setRumorBrand} options={brands} />
              </div>
              <div>
                <label className="block text-xs text-[#c0c0cc] mb-1">Kontekst (opcjonalnie)</label>
                <input
                  type="text" value={rumorContext} onChange={(e) => setRumorContext(e.target.value)}
                  placeholder="Dodatkowy kontekst..." className={inputCls}
                />
              </div>
            </div>
          </>
        )}

        {/* ── Zakładka: Scenariusz / Event ── */}
        {tab === 'topic' && (
          <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-6 space-y-5">
            {/* Mode selector */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white font-semibold">Scenariusz / Wydarzenie</h2>
                <p className="text-[#9898a8] text-xs mt-0.5">
                  {topicMode === 'single'
                    ? 'Agenci reagują na zdarzenie z perspektywy swoich wartości i sytuacji życiowej.'
                    : 'Wiele narracji tego samego zdarzenia konkuruje w grafie społecznym.'}
                </p>
              </div>
              <div className="flex rounded-lg border border-[#38383f] overflow-hidden text-xs shrink-0 ml-4">
                {([
                  { key: 'single' as TopicMode, label: 'Jeden scenariusz' },
                  { key: 'frames' as TopicMode, label: 'Competitive Contagion' },
                ]).map(({ key, label }) => (
                  <button
                    key={key} type="button" onClick={() => setTopicMode(key)}
                    className={`px-3 py-2 transition-colors whitespace-nowrap ${topicMode === key ? 'bg-[#6366f1] text-white' : 'text-[#9898a8] hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {topicMode === 'single' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#c0c0cc] mb-1">Nazwa symulacji</label>
                  <input
                    type="text" value={topicStudyName} onChange={(e) => setTopicStudyName(e.target.value)}
                    placeholder="np. Scenariusz: blokada Ormuz" className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#c0c0cc] mb-1">Scenariusz *</label>
                  <textarea
                    value={topicQuery} onChange={(e) => setTopicQuery(e.target.value)}
                    placeholder="Opisz wydarzenie. Np.: Iran blokuje Cieśninę Ormuz. Ceny ropy skaczą o 40% w ciągu tygodnia..."
                    rows={4} className={`${inputCls} resize-none`}
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    {TOPIC_EXAMPLES.map((ex) => (
                      <button
                        key={ex} type="button" onClick={() => setTopicQuery(ex)}
                        className="text-xs bg-[#38383f] hover:bg-[#52525a] text-[#c0c0cc] hover:text-white px-2 py-1 rounded transition-colors"
                      >
                        {ex.slice(0, 40)}…
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#c0c0cc] mb-1">Kontekst (opcjonalnie)</label>
                  <textarea
                    value={topicContext} onChange={(e) => setTopicContext(e.target.value)}
                    placeholder="Dodatkowy kontekst historyczny, dane, tło wydarzenia..."
                    rows={2} className={`${inputCls} resize-none`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#c0c0cc] mb-1">
                    Przewidywane skutki (opcjonalnie, jeden per linię)
                  </label>
                  <textarea
                    value={topicImpacts} onChange={(e) => setTopicImpacts(e.target.value)}
                    placeholder={"Wzrost cen paliw o 30%\nZwolnienia w transporcie\nInflacja powróci do 15%"}
                    rows={3} className={`${inputCls} resize-none font-mono`}
                  />
                </div>
              </div>
            )}

            {topicMode === 'frames' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#c0c0cc] mb-1">Nazwa badania</label>
                  <input
                    type="text" value={framesStudyName} onChange={e => setFramesStudyName(e.target.value)}
                    placeholder="np. Framing: awaria elektrowni" className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {frames.map((f, i) => (
                    <div key={f.id} className="border border-[#38383f] rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold shrink-0" style={{ color: ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6'][i % 5] }}>
                          Framing {i + 1}
                        </span>
                        <input
                          type="text" value={f.label}
                          onChange={e => setFrames(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                          placeholder="Krótka etykieta"
                          className={`${inputCls} text-xs flex-1`}
                        />
                        {frames.length > 2 && (
                          <button type="button" onClick={() => setFrames(prev => prev.filter((_, j) => j !== i))}
                            className="p-1 text-[#6b6b78] hover:text-red-400 shrink-0">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <textarea
                        value={f.text}
                        onChange={e => setFrames(prev => prev.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
                        placeholder="Treść narracji — jak agenci sformułują ten framing w postach..."
                        rows={4} className={`${inputCls} resize-none text-xs`}
                      />
                    </div>
                  ))}
                </div>
                {frames.length < 6 && (
                  <button
                    type="button"
                    onClick={() => setFrames(prev => [...prev, { id: `f${Date.now()}`, label: '', text: '' }])}
                    className="text-xs text-[#6366f1] hover:text-indigo-300 flex items-center gap-1 transition-colors"
                  >
                    + Dodaj framing
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Parametry symulacji — wspólne */}
        <SimulationParams value={params} onChange={setParams} />

        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || anyUploading}
          className="w-full flex items-center justify-center gap-2 bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Inicjalizuję symulację...
            </>
          ) : anyUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Przesyłam kreację...
            </>
          ) : (
            <>
              <Network className="w-4 h-4" />
              {tab === 'topic' && topicMode === 'frames'
                ? 'Uruchom competitive contagion'
                : tab === 'topic'
                ? 'Uruchom predykcję społeczną'
                : tab === 'rumor'
                ? 'Uruchom symulację komunikatu'
                : adMode === 'ab'
                ? 'Uruchom test A/B'
                : adMode === 'segment'
                ? 'Uruchom porównanie segmentów'
                : 'Uruchom symulację reklamy'}
            </>
          )}
        </button>
      </form>
    </div>
  );
}
