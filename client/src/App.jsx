import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Index from './pages/Index.jsx';
import Auth from './pages/Auth.jsx';
import Room from './pages/Room.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  });
  const navigate = useNavigate();

  const location = useLocation();
  useEffect(() => {
    // Don't force redirect to /auth when visiting a room directly. Allow
    // anonymous users to open room links (Room will attempt a guest login).
    if (!user && !location.pathname.startsWith('/room')) {
      navigate('/auth');
    }
  }, [user, navigate, location.pathname]);

  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Index user={user} setUser={setUser} />} />
        <Route path="/auth" element={<Auth setUser={setUser} />} />
        <Route path="/room/:roomId" element={<Room user={user} setUser={setUser} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
