import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Plus, Clock, TrendingUp, Eye, Heart, ChevronRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { getStudies, type StudyResult } from '../utils/api';

export function Studies() {
  const [studies, setStudies] = useState<StudyResult[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const sk = 'bg-[#27272a] rounded animate-pulse';

  useEffect(() => {
    getStudies()
      .then(setStudies)
      .catch(() => setStudies([]))
      .finally(() => setLoading(false));
  }, []);

  const handleOpen = (study: StudyResult) => {
    sessionStorage.setItem('currentStudy', JSON.stringify(study));
    navigate(`/results/${study.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-white">Historia badań</h2>
          <p className="text-sm text-[#a1a1aa] mt-1">Ostatnie 20 badań zapisanych na serwerze</p>
        </div>
        <Link to="/new-study">
          <Button className="bg-[#6366f1] hover:bg-[#5558e3] text-white rounded-lg">
            <Plus className="w-4 h-4 mr-2" />
            Nowe badanie
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className={`h-20 ${sk}`} />
          ))}
        </div>
      ) : studies.length === 0 ? (
        <div className="bg-[#18181b] border border-[#27272a] rounded-xl p-12 text-center">
          <Clock className="w-10 h-10 text-[#52525b] mx-auto mb-3" />
          <p className="text-[#a1a1aa] text-sm">Brak zapisanych badań</p>
          <p className="text-[#52525b] text-xs mt-1">Uruchom pierwsze badanie, aby zobaczyć historię</p>
        </div>
      ) : (
        <div className="space-y-3">
          {studies.map((study) => (
            <button
              key={study.id}
              onClick={() => handleOpen(study)}
              className="w-full bg-[#18181b] border border-[#27272a] rounded-xl p-5 text-left hover:border-[#6366f1] transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white font-medium truncate">{study.campaignName}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-[#71717a]">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(study.date).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3 text-[#6366f1]" />
                      ATT {study.metrics.attention.toFixed(1)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Heart className="w-3 h-3 text-[#8b5cf6]" />
                      RES {study.metrics.resonance.toFixed(1)}
                    </span>
                    <span className={`flex items-center gap-1 ${study.metrics.purchaseIntentDelta >= 0 ? 'text-[#10b981]' : 'text-[#ef4444]'}`}>
                      <TrendingUp className="w-3 h-3" />
                      PI {study.metrics.purchaseIntentDelta >= 0 ? '+' : ''}{study.metrics.purchaseIntentDelta}%
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#52525b] group-hover:text-[#6366f1] transition-colors ml-4 shrink-0" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
