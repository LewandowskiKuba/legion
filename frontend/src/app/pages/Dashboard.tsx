import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Users, TrendingUp, ArrowRight, Calendar, Award } from 'lucide-react';
import { getCampaigns, getPopulation, type Campaign, type PopulationStats } from '../utils/api';
import { Button } from '../components/ui/button';

export function Dashboard() {
  const [population, setPopulation] = useState<PopulationStats | null>(null);
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const [popData, campaigns] = await Promise.all([getPopulation(), getCampaigns()]);
      setPopulation(popData);
      setAllCampaigns(campaigns);
      setRecentCampaigns(campaigns.slice(0, 3));
      setLoading(false);
    }
    loadData();
  }, []);

  const now = new Date();
  const studiesThisMonth = allCampaigns.filter((c) => {
    const d = new Date(c.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }).length;

  const avgAttention = allCampaigns.length > 0
    ? (allCampaigns.reduce((s, c) => s + c.attentionScore, 0) / allCampaigns.length).toFixed(1)
    : '—';

  const uniqueBrands = new Set(allCampaigns.map((c) => c.brand).filter((b) => b && b !== '–')).size;

  const sk = 'bg-[#27272a] rounded animate-pulse';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Dashboard</h2>
          <p className="text-sm text-[#a1a1aa] mt-1">Przegląd syntetycznej populacji i ostatnich badań</p>
        </div>
        <Link to="/new-study">
          <Button className="bg-[#6366f1] hover:bg-[#5558e3] text-white rounded-lg px-6">
            Nowe badanie
          </Button>
        </Link>
      </div>

      {/* Population Card */}
      <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-white mb-1">Stan populacji syntetycznej</h3>
            <p className="text-sm text-[#a1a1aa]">Aktualna kalibracja: GUS BDL 2024, NSP 2021, CBOS 2025</p>
          </div>
          <Link to="/population">
            <Button variant="ghost" size="sm" className="text-[#6366f1] hover:text-[#5558e3] hover:bg-[#27272a]">
              Szczegóły
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-4 gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[#a1a1aa] text-sm">
              <Users className="w-4 h-4" />
              <span>Wielkość próby</span>
            </div>
            {population ? <p className="text-3xl font-semibold text-white">n={population.total}</p> : <div className={`h-9 w-24 ${sk}`} />}
          </div>

          <div className="space-y-1">
            <div className="text-[#a1a1aa] text-sm">Średni wiek</div>
            {population ? <p className="text-3xl font-semibold text-white">{population.averageAge} lat</p> : <div className={`h-9 w-20 ${sk}`} />}
          </div>

          <div className="space-y-1">
            <div className="text-[#a1a1aa] text-sm">Płeć</div>
            {population ? (
              <>
                <p className="text-3xl font-semibold text-white">{population.genderDistribution.female}% K</p>
                <p className="text-xs text-[#a1a1aa]">{population.genderDistribution.male}% M</p>
              </>
            ) : <div className={`h-9 w-20 ${sk}`} />}
          </div>

          <div className="space-y-1">
            <div className="text-[#a1a1aa] text-sm">Miasta {'>'}100k</div>
            {population ? <p className="text-3xl font-semibold text-white">{population.regions.urban}%</p> : <div className={`h-9 w-16 ${sk}`} />}
          </div>
        </div>
      </div>

      {/* Recent Studies */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Ostatnie badania</h3>
        </div>

        <div className="space-y-3">
          {loading && [0, 1, 2].map((i) => (
            <div key={i} className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex-1 space-y-2">
                  <div className={`h-4 w-48 ${sk}`} />
                  <div className={`h-3 w-24 ${sk}`} />
                </div>
                <div className="flex gap-8 mr-4">
                  {[0,1,2,3].map(j => <div key={j} className={`h-6 w-12 ${sk}`} />)}
                </div>
              </div>
            </div>
          ))}
          {!loading && recentCampaigns.map((campaign) => (
            <Link key={campaign.id} to={`/results/${campaign.id}`}>
              <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5 hover:border-[#6366f1] transition-colors cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="text-base font-semibold text-white group-hover:text-[#6366f1] transition-colors">
                        {campaign.name}
                      </h4>
                      <span className="text-xs px-2 py-1 rounded bg-[#27272a] text-[#a1a1aa]">
                        {campaign.brand}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(campaign.date).toLocaleDateString('pl-PL')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-8 mr-4">
                    <div className="text-right">
                      <div className="text-xs text-[#a1a1aa] mb-1">Attention Score</div>
                      <div className="text-xl font-semibold text-white">{campaign.attentionScore.toFixed(1)}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-[#a1a1aa] mb-1">Resonance</div>
                      <div className="text-xl font-semibold text-white">{campaign.resonance.toFixed(1)}</div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-[#a1a1aa] mb-1">Purchase Intent Δ</div>
                      <div className="text-xl font-semibold text-[#10b981]">+{campaign.purchaseIntentDelta}%</div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs text-[#a1a1aa] mb-1">Trust Δ</div>
                      <div className="text-xl font-semibold text-[#10b981]">+{campaign.trustDelta}%</div>
                    </div>
                  </div>

                  <ArrowRight className="w-5 h-5 text-[#a1a1aa] group-hover:text-[#6366f1] transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#6366f1]/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-[#6366f1]" />
            </div>
            <div>
              <div className="text-sm text-[#a1a1aa]">Badania w tym miesiącu</div>
              <div className="text-xl font-semibold text-white">{studiesThisMonth}</div>
            </div>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-[#10b981]" />
            </div>
            <div>
              <div className="text-sm text-[#a1a1aa]">Śr. Attention Score</div>
              <div className="text-xl font-semibold text-white">{avgAttention}</div>
            </div>
          </div>
        </div>

        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#f59e0b]" />
            </div>
            <div>
              <div className="text-sm text-[#a1a1aa]">Testowane marki</div>
              <div className="text-xl font-semibold text-white">{uniqueBrands || '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}