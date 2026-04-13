import { RouterProvider, createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { NewStudy } from './pages/NewStudy';
import { Results } from './pages/Results';
import { Population } from './pages/Population';
import { Studies } from './pages/Studies';
import { NewSimulation } from './pages/NewSimulation';
import { SimulationView } from './pages/SimulationView';
import { Simulations } from './pages/Simulations';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'new-study', element: <NewStudy /> },
      { path: 'results/:id', element: <Results /> },
      { path: 'population', element: <Population /> },
      { path: 'studies', element: <Studies /> },
      { path: 'new-simulation', element: <NewSimulation /> },
      { path: 'simulation/:id', element: <SimulationView /> },
      { path: 'simulations', element: <Simulations /> },
    ],
  },
], { basename: '/adstest' });

export default function App() {
  return <RouterProvider router={router} />;
}
