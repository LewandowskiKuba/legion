import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Network, Loader2, CheckCircle2, Clock, AlertCircle, Plus } from 'lucide-react';
import { listSimulations, type SimulationSummary } from '../utils/api';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
    complete: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'Zakończona', color: 'text-green-400 bg-green-400/10 border-green-400/20' },
    running: { icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, label: 'W toku', color: 'text-[#6366f1] bg-[#6366f1]/10 border-[#6366f1]/20' },
    initializing: { icon: <Clock className="w-3.5 h-3.5" />, label: 'Inicjalizacja', color: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' },
    error: { icon: <AlertCircle className="w-3.5 h-3.5" />, label: 'Błąd', color: 'text-red-400 bg-red-400/10 border-red-400/20' },
  };

  const s = map[status] ?? map['initializing'];

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border ${s.color}`}>
      {s.icon} {s.label}
    </span>
  );
}

export function Simulations() {
  const [sims, setSims] = useState<SimulationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listSimulations()
      .then(setSims)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Symulacje</h1>
          <p className="text-[#9898a8] text-sm mt-1">Historia wielorundowych symulacji społecznych</p>
        </div>
        <Link
          to="/new-simulation"
          className="flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Nowa symulacja
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[#6366f1]" />
        </div>
      ) : sims.length === 0 ? (
        <div className="bg-[#1f1f25] border border-[#38383f] rounded-xl p-12 text-center space-y-4">
          <Network className="w-10 h-10 text-[#52525a] mx-auto" />
          <p className="text-[#9898a8]">Brak symulacji. Uruchom pierwszą!</p>
          <Link
            to="/new-simulation"
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#6366f1] hover:bg-[#4f46e5] text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Nowa symulacja
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sims.map((sim) => (
            <Link
              key={sim.id}
              to={`/simulation/${sim.id}`}
              className="block bg-[#1f1f25] border border-[#38383f] hover:border-[#6366f1]/50 rounded-xl p-4 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Network className="w-5 h-5 text-[#6366f1] flex-shrink-0" />
                  <div>
                    <p className="text-white font-medium group-hover:text-[#818cf8] transition-colors">
                      {sim.studyName || 'Symulacja bez nazwy'}
                    </p>
                    <p className="text-[#9898a8] text-xs mt-0.5">
                      {new Date(sim.createdAt).toLocaleString('pl-PL', {
                        day: '2-digit', month: '2-digit', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-white text-sm font-mono">
                      {sim.currentRound}/{sim.totalRounds}
                    </p>
                    <p className="text-[#6b6b78] text-xs">rund</p>
                  </div>

                  <div className="w-24">
                    <div className="h-1.5 bg-[#38383f] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#6366f1] rounded-full transition-all"
                        style={{ width: `${sim.totalRounds > 0 ? (sim.currentRound / sim.totalRounds) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  <StatusBadge status={sim.status} />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
