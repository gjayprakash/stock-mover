import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import TodayPage from './pages/TodayPage';
import ProblemPage from './pages/ProblemPage';
import MovesPage from './pages/MovesPage';
import StorePage from './pages/StorePage';
import AskPage from './pages/AskPage';
import AiUsagePage from './pages/AiUsagePage';
import RunPage from './pages/RunPage';
import AddStockPage from './pages/AddStockPage';
import AddStorePage from './pages/AddStorePage';
import { EmptyState } from './components/EmptyState';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TodayPage />} />
        <Route path="problems/:id" element={<ProblemPage />} />
        <Route path="moves" element={<MovesPage />} />
        <Route path="stores" element={<StorePage />} />
        <Route path="stores/:id" element={<StorePage />} />
        <Route path="ask" element={<AskPage />} />
        <Route path="ai" element={<AiUsagePage />} />
        <Route path="run" element={<RunPage />} />
        <Route path="add-stock" element={<AddStockPage />} />
        <Route path="add-store" element={<AddStorePage />} />
        <Route path="*" element={<EmptyState title="Page not found" body="Use the menu to get back to today's moves." />} />
      </Route>
    </Routes>
  );
}
