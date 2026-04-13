import { RouterProvider, createBrowserRouter } from 'react-router';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Results } from './pages/Results';
import { Population } from './pages/Population';
import { Studies } from './pages/Studies';
import { NewSimulation } from './pages/NewSimulation';
import { SimulationView } from './pages/SimulationView';
import { Simulations } from './pages/Simulations';
import { SimulationCompare } from './pages/SimulationCompare';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'results/:id', element: <Results /> },
      { path: 'population', element: <Population /> },
      { path: 'studies', element: <Studies /> },
      { path: 'new-simulation', element: <NewSimulation /> },
      { path: 'simulation/:id', element: <SimulationView /> },
      { path: 'simulation/compare/:idA/:idB', element: <SimulationCompare /> },
      { path: 'simulations', element: <Simulations /> },
    ],
  },
], { basename: '/adstest' });

export default function App() {
  return <RouterProvider router={router} />;
}
