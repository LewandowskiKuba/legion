import { Outlet, Link, useLocation } from 'react-router';
import { BarChart3, Users, FlaskConical, Home, History, Network } from 'lucide-react';

export function Layout() {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/new-simulation', label: 'Nowa symulacja', icon: Network },
    { path: '/simulations', label: 'Symulacje', icon: History },
    { path: '/new-study', label: 'Ad testing', icon: FlaskConical },
    { path: '/studies', label: 'Historia badań', icon: History },
    { path: '/population', label: 'Populacja', icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#0f0f11]">
      {/* Navigation */}
      <nav className="border-b border-[#27272a] bg-[#0f0f11] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-[#6366f1]" />
              <div>
                <h1 className="text-lg font-semibold text-white">We Are Legion</h1>
                <p className="text-xs text-[#a1a1aa]">Social Simulation & Prediction Engine</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-[#6366f1] text-white'
                        : 'text-[#a1a1aa] hover:text-white hover:bg-[#27272a]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
