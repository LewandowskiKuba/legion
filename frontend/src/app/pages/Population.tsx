import { useEffect, useState } from 'react';
import { Users, Info } from 'lucide-react';
import { getPopulation, type PopulationStats } from '../utils/api';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

export function Population() {
  const [population, setPopulation] = useState<PopulationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const data = await getPopulation();
      setPopulation(data);
      setLoading(false);
    }
    loadData();
  }, []);

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

  const ageDistribution = [
    { segment: '18-24', value: 12 },
    { segment: '25-34', value: 22 },
    { segment: '35-44', value: 24 },
    { segment: '45-54', value: 20 },
    { segment: '55-64', value: 14 },
    { segment: '65+', value: 8 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-white">Populacja syntetyczna</h2>
        <p className="text-sm text-[#a1a1aa] mt-1">Rozkłady demograficzne i socjodemograficzne próby badawczej</p>
      </div>

      {/* Calibration Info */}
      <div className="bg-[#6366f1]/10 border border-[#6366f1]/20 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-[#6366f1] mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Kalibracja populacji</h3>
            <p className="text-sm text-[#a1a1aa]">
              Dane kalibracyjne: GUS BAEL 2023, CBOS 2025, 4P/Media Republic 2024
            </p>
            <p className="text-xs text-[#a1a1aa] mt-2">
              Syntetyczna populacja została skalibrowana na podstawie rzeczywistych rozkładów demograficznych i społecznych w Polsce.
              Próba n=50 zapewnia reprezentatywność dla głównych segmentów badawczych.
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
          <div className="text-3xl font-bold text-white">n={population.total}</div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="text-sm text-[#a1a1aa] mb-2">Średni wiek</div>
          <div className="text-3xl font-bold text-white">{population.averageAge} lat</div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="text-sm text-[#a1a1aa] mb-2">Mediana dochodu</div>
          <div className="text-3xl font-bold text-white">5 200 zł</div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="text-sm text-[#a1a1aa] mb-2">Wykształcenie wyższe</div>
          <div className="text-3xl font-bold text-white">{population.education.higher}%</div>
        </div>
      </div>

      {/* Age Distribution */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Rozkład wiekowy</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ageDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="segment" tick={{ fill: '#a1a1aa' }} />
              <YAxis tick={{ fill: '#a1a1aa' }} label={{ value: '%', angle: -90, position: 'insideLeft', fill: '#a1a1aa' }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gender & Location */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Płeć</h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={genderData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} ${value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {genderData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Typ miejscowości</h3>
          <div className="h-64 flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={locationData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} ${value}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {locationData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Income, Education, Political */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <h3 className="font-semibold text-white mb-4 text-sm">Dochód gospodarstwa domowego</h3>
          <div className="space-y-3">
            {incomeData.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#a1a1aa]">{item.segment}</span>
                  <span className="text-white font-medium">{item.value}%</span>
                </div>
                <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#10b981] rounded-full transition-all"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <h3 className="font-semibold text-white mb-4 text-sm">Wykształcenie</h3>
          <div className="space-y-3">
            {educationData.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#a1a1aa]">{item.segment}</span>
                  <span className="text-white font-medium">{item.value}%</span>
                </div>
                <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#6366f1] rounded-full transition-all"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <h3 className="font-semibold text-white mb-4 text-sm">Preferencje polityczne</h3>
          <div className="space-y-3">
            {politicalData.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-[#a1a1aa]">{item.segment}</span>
                  <span className="text-white font-medium">{item.value}%</span>
                </div>
                <div className="h-2 bg-[#27272a] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#f59e0b] rounded-full transition-all"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
        <h3 className="font-semibold text-white mb-3 text-sm">Dodatkowe informacje</h3>
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div>
            <h4 className="text-[#a1a1aa] mb-2 font-medium">Źródła danych kalibracyjnych:</h4>
            <ul className="space-y-1 text-[#71717a]">
              <li>• GUS Bilans kapitału ludzkiego 2023 (wiek, wykształcenie)</li>
              <li>• CBOS Preferencje społeczne 2025 (postawy, polityka)</li>
              <li>• 4P Research / Media Republic 2024 (zachowania konsumenckie)</li>
            </ul>
          </div>
          <div>
            <h4 className="text-[#a1a1aa] mb-2 font-medium">Metodologia syntezy:</h4>
            <ul className="space-y-1 text-[#71717a]">
              <li>• Stratyfikowane losowanie z wagami populacyjnymi</li>
              <li>• Kalibracja wielowymiarowa (age × gender × location)</li>
              <li>• Generatywny model agent-based dla zachowań</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
