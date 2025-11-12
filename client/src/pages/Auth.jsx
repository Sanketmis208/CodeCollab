import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../lib/socket.js';

export default function Auth({ setUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState('');
  const timeoutRef = useRef(null);
  const navigate = useNavigate();
  const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (raw) navigate('/');
  }, [navigate]);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => {
      setConnected(false);
      setError('Unable to reach server. Check it is running and VITE_SERVER_URL is correct.');
    };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  const handleSignup = async () => {
    if (!username.trim() || !password) return setError('Username and password required');
    if (password !== confirm) return setError('Passwords do not match');
    setError('');
    setLoading(true);
    try {
      const resp = await fetch(API + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }) });
      const data = await resp.json();
      setLoading(false);
      if (resp.status === 409) return setError('Username already taken');
      if (!resp.ok) return setError(data?.error || 'Signup failed');
      const u = { userId: data.userId, username: data.username };
      try { localStorage.setItem('user', JSON.stringify(u)); } catch (e) { /* ignore */ }
      setUser?.(u);
      if (!socket.connected) socket.connect();
      try { socket.emit('auth:login', { username: u.username, userId: u.userId }, () => {}); } catch (e) { /* ignore */ }
      navigate('/');
    } catch (err) {
      setLoading(false);
      setError('Signup failed. Is the server running?');
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password) return setError('Username and password required');
    setError('');
    setLoading(true);
    try {
      const resp = await fetch(API + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }) });
      const data = await resp.json();
      setLoading(false);
      if (resp.status === 401) return setError('Invalid username or password');
      if (!resp.ok) return setError(data?.error || 'Login failed');

      const u = { userId: data.userId, username: data.username };
      try { localStorage.setItem('user', JSON.stringify(u)); } catch (e) { /* ignore */ }
      setUser?.(u);

      if (!socket.connected) socket.connect();
      try {
        socket.emit('auth:login', { username: u.username, userId: u.userId }, (ack) => {});
      } catch (e) {
        // non-fatal
      }

      navigate('/');
    } catch (err) {
      setLoading(false);
      setError('Login failed. Is the server running?');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header: centered app title */}
      <header className="border-b border-slate-700/50 px-6 py-6 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-semibold shadow-lg">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </div>
          <div className="text-4xl font-extrabold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent tracking-tight">
            CodeCollab
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="flex items-center justify-center min-h-[70vh]">
          <div className="w-full max-w-md">
            {/* Auth Card */}
            <div className="group relative">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
              <div className="relative bg-slate-800/90 p-8 rounded-xl border border-slate-700/50 backdrop-blur-sm">
                {/* Form Header */}
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-slate-200 mb-2">
                    {isSignUp ? 'Sign Up' : 'Sign In'}
                  </h2>
                  <p className="text-slate-400 text-sm">
                    {isSignUp ? 'Create an account' : 'Enter your credentials to continue'}
                  </p>
                </div>

                {/* Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Username</label>
                    <input
                      className="input w-full bg-slate-700/50 border-slate-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white placeholder-slate-400"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                    <input 
                      className="input w-full bg-slate-700/50 border-slate-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white placeholder-slate-400"
                      placeholder="Enter your password" 
                      type="password" 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                    />
                  </div>

                  {isSignUp && (
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                      <input
                        className="input w-full bg-slate-700/50 border-slate-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 text-white placeholder-slate-400"
                        placeholder="Confirm your password"
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSignup()}
                      />
                    </div>
                  )}

                  {/* Error Message */}
                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="text-sm text-red-400">{error}</span>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button 
                    className="w-full btn-primary bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 border-0 text-white shadow-lg shadow-purple-500/25 font-medium py-3 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    onClick={isSignUp ? handleSignup : handleLogin} 
                    disabled={loading || !username.trim() || !password || (isSignUp && !confirm)}
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Signing In...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                        </svg>
                        Sign In
                      </>
                    )}
                  </button>
                  <div className="mt-3 text-center">
                    <button className="text-sm text-slate-300 hover:text-white btn-ghost" onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
                      {isSignUp ? 'Have an account? Sign in' : "Don't have an account? Sign up"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}