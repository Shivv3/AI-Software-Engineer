import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UniversalHomePage from './components/UniversalHomePage';
import HomePage from './components/HomePage';
import SRSEditor from './components/SRSEditor';
import DesignPage from './components/DesignPage';
import SystemDesignWizard from './components/SystemDesignWizard';
import DatabaseSchemaGenerator from './components/DatabaseSchemaGenerator';
import DiagramGenerator from './components/DiagramGenerator';
import ProjectsDashboard from './components/ProjectsDashboard';
import ProjectLayout from './components/ProjectLayout';
import ImplementationLab from './components/ImplementationLab';
import ValidationLab from './components/ValidationLab';
import AuthPage from './components/AuthPage';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={
          <ProtectedRoute>
            <ProjectsDashboard />
          </ProtectedRoute>
        } />
        <Route path="/projects/:projectId" element={
          <ProtectedRoute>
            <ProjectLayout />
          </ProtectedRoute>
        }>
          <Route index element={<UniversalHomePage />} />
          <Route path="requirements" element={<HomePage />} />
          <Route path="design" element={<DesignPage />} />
          <Route path="design/system" element={<SystemDesignWizard />} />
          <Route path="design/schema" element={<DatabaseSchemaGenerator />} />
          <Route path="design/diagram" element={<DiagramGenerator />} />
          <Route path="srs-editor" element={<SRSEditor />} />
          <Route path="implementation" element={<ImplementationLab />} />
          <Route path="quality" element={<ValidationLab />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;