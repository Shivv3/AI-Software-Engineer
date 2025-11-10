import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './components/HomePage';
import SRSEditor from './components/SRSEditor';
import './App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/srs-editor" element={<SRSEditor />} />
      </Routes>
    </Router>
  );
}

export default App;