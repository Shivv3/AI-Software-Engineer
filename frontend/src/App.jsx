import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UniversalHomePage from './components/UniversalHomePage';
import HomePage from './components/HomePage';
import SRSEditor from './components/SRSEditor';
import DesignPage from './components/DesignPage';
import SystemDesignWizard from './components/SystemDesignWizard';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<UniversalHomePage />} />
        <Route path="/requirements" element={<HomePage />} />
        <Route path="/design" element={<DesignPage />} />
        <Route path="/design/system" element={<SystemDesignWizard />} />
        <Route path="/srs-editor" element={<SRSEditor />} />
      </Routes>
    </Router>
  );
}

export default App;