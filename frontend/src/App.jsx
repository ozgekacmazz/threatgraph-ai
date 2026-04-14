import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/AppLayout";
import ArchitecturePage from "./pages/ArchitecturePage";
import AnalysisPage from "./pages/AnalysisPage";
import GraphPage from "./pages/GraphPage";
import HomePage from "./pages/HomePage";
import NewScenarioPage from "./pages/NewScenarioPage";
import ScenarioDetailPage from "./pages/ScenarioDetailPage";
import ScenarioSummaryPage from "./pages/ScenarioSummaryPage";
import ScenariosPage from "./pages/ScenariosPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/analiz" element={<AnalysisPage />} />
          <Route path="/mimari" element={<ArchitecturePage />} />
          <Route path="/graf" element={<GraphPage />} />
          <Route path="/senaryolar" element={<ScenariosPage />} />
          <Route path="/senaryolar/yeni" element={<NewScenarioPage />} />
          <Route path="/senaryolar/:scenarioKind/:scenarioId" element={<ScenarioSummaryPage />} />
          <Route path="/senaryolar/:scenarioKind/:scenarioId/detay" element={<ScenarioDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
