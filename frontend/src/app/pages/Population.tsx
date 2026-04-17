import { useEffect, useState } from 'react';
import { Users, Info, RefreshCw } from 'lucide-react';
import { getPopulation, type PopulationStats, BASE } from '../utils/api';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

async function regeneratePopulation(size: number): Promise<{ count: number }> {
  const res = await fetch(`${BASE}/api/population/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ size }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function Population() {
  const [population, setPopulation] = useState<PopulationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [regenMsg, setRegenMsg] = useState<string | null>(null);

  async function loadData() {
    setLoading(true);
    const data = await getPopulation();
    setPopulation(data);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleRegenerate() {
    if (!confirm('Wygenerować nową populację 7 700 agentów? Trwa to kilkanaście sekund.')) return;
    setRegenerating(true);
    setRegenMsg(null);
    try {
      const { count } = await regeneratePopulation(7700);
      setRegenMsg(`✓ Wygenerowano ${count.toLocaleString('pl-PL')} agentów`);
      await loadData();
    } catch (err: any) {
      setRegenMsg(`Błąd: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  }

  if (loading || !population) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-[#a1a1aa]">Ładowanie danych populacji...</div>
      </div>
    );
  }

  const genderData = [
    { name: 'Kobiety', value: population.genderDistribution.female, color: '#8b5cf6' },
    { name: 'Mężczyźni', value: population.genderDistribution.male, color: '#6366f1' },
  ];

  const locationData = [
    { name: 'Miasta >500k', value: population.regions.urban, color: '#6366f1' },
    { name: 'Miasta 100-500k', value: population.regions.suburban, color: '#8b5cf6' },
    { name: 'Mniejsze/Wieś', value: population.regions.rural, color: '#a78bfa' },
  ];

  const incomeData = [
    { segment: 'Niski', value: population.incomeDistribution.low },
    { segment: 'Średni', value: population.incomeDistribution.medium },
    { segment: 'Wysoki', value: population.incomeDistribution.high },
  ];

  const educationData = [
    { segment: 'Podstawowe', value: population.education.basic },
    { segment: 'Średnie', value: population.education.secondary },
    { segment: 'Wyższe', value: population.education.higher },
  ];

  const politicalData = [
    { segment: 'Lewica', value: population.politicalPreferences.left },
    { segment: 'Centrum', value: population.politicalPreferences.center },
    { segment: 'Prawica', value: population.politicalPreferences.right },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Populacja syntetyczna</h2>
          <p className="text-sm text-[#a1a1aa] mt-1">Rozkłady demograficzne i socjodemograficzne próby badawczej</p>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="flex items-center gap-2 px-4 py-2 bg-[#27272a] hover:bg-[#3f3f46] disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Generuję…' : 'Regeneruj populację'}
        </button>
      </div>

      {regenMsg && (
        <div className={`px-4 py-3 rounded-lg text-sm ${regenMsg.startsWith('✓') ? 'bg-green-900/20 border border-green-800/40 text-green-400' : 'bg-red-900/20 border border-red-800/40 text-red-400'}`}>
          {regenMsg}
        </div>
      )}

      {/* Calibration Info */}
      <div className="bg-[#6366f1]/10 border border-[#6366f1]/20 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[#6366f1] mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Kalibracja populacji</h3>
            <p className="text-sm text-[#a1a1aa]">
              Dane kalibracyjne: GUS BDL 2024, NSP 2021, CBOS 2025
            </p>
            <p className="text-xs text-[#a1a1aa] mt-2">
              Syntetyczna populacja skalibrowana na podstawie rzeczywistych rozkładów demograficznych Polski.
              Próba n={population.total.toLocaleString('pl-PL')} zapewnia reprezentatywność dla głównych segmentów badawczych.
            </p>
          </div>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <Users className="w-5 h-5 text-[#6366f1]" />
            <span className="text-sm text-[#a1a1aa]">Wielkość próby</span>
          </div>
          <div className="text-3xl font-bold text-white">n={population.total.toLocaleString('pl-PL')}</div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="text-sm text-[#a1a1aa] mb-2">Średni wiek</div>
          <div className="text-3xl font-bold text-white">{population.averageAge} lat</div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="text-sm text-[#a1a1aa] mb-2">Płeć K/M</div>
          <div className="text-3xl font-bold text-white">{population.genderDistribution.female}% / {population.genderDistribution.male}%</div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="text-sm text-[#a1a1aa] mb-2">Wykształcenie wyższe</div>
          <div className="text-3xl font-bold text-white">{population.education.higher}%</div>
        </div>
      </div>

      {/* Gender & Location */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Płeć</h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={genderData} cx="50%" cy="50%" labelLine={false}
                  label={({ name, value }) => `${name} ${value}%`}
                  outerRadius={80} dataKey="value">
                  {genderData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} labelStyle={{ color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Typ miejscowości</h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={locationData} cx="50%" cy="50%" labelLine={false}
                  label={({ name, value }) => `${name} ${value}%`}
                  outerRadius={80} dataKey="value">
                  {locationData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} labelStyle={{ color: '#fff' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Income, Education, Political */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { title: 'Dochód', data: incomeData, color: '#10b981' },
          { title: 'Wykształcenie', data: educationData, color: '#6366f1' },
          { title: 'Preferencje polityczne', data: politicalData, color: '#f59e0b' },
        ].map(({ title, data, color }) => (
          <div key={title} className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
            <h3 className="font-semibold text-white mb-4 text-sm">{title}</h3>
            <div className="space-y-3">
              {data.map((item, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-[#a1a1aa]">{item.segment}</span>
                    <span className="text-white font-medium">{item.value}%</span>
                  </div>
                  <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${item.value}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Age distribution from API */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Rozkład wiekowy</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={population.ageDistribution ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="segment" tick={{ fill: '#a1a1aa' }} />
              <YAxis tick={{ fill: '#a1a1aa' }} label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#a1a1aa' }} />
              <Tooltip contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }} labelStyle={{ color: '#fff' }} />
              <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 text-sm">Dodatkowe informacje</h3>
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div>
            <h4 className="text-[#a1a1aa] mb-2 font-medium">Źródła danych kalibracyjnych:</h4>
            <ul className="space-y-1 text-[#71717a]">
              <li>• GUS BDL API 2024 – wiek, region, zamieszkanie</li>
              <li>• GUS NSP 2021 – wykształcenie, typy gospodarstw</li>
              <li>• CBOS BS/9/2025 – preferencje polityczne</li>
              <li>• Gemius/PBI Megapanel 2024 Q3 – nawyki medialne</li>
            </ul>
          </div>
          <div>
            <h4 className="text-[#a1a1aa] mb-2 font-medium">Metodologia syntezy:</h4>
            <ul className="space-y-1 text-[#71717a]">
              <li>• Stratyfikowane losowanie z wagami populacyjnymi</li>
              <li>• Kalibracja wielowymiarowa (wiek × płeć × region × dochód)</li>
              <li>• Auto-aktualizacja wag z bdl_snapshot.json przy każdym restarcie</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
