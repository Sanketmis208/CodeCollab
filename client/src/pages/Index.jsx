import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

export default function Index({ user, setUser }) {
  const [rooms, setRooms] = useState([]);
  const [roomName, setRoomName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [modalRoomName, setModalRoomName] = useState('');
  const [modalRoomCode, setModalRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const initials = (user?.username || 'G').split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase();

  const loadRooms = async () => {
    const res = await fetch(`${API}/api/rooms`);
    const data = await res.json();
    // Only show recent rooms created by the current user to reduce clutter
    try {
      if (user) {
        const uid = user.userId;
        const uname = user.username;
        setRooms((data || []).filter(r => String(r.createdBy) === String(uid) || String(r.createdByName) === String(uname)));
      } else {
        setRooms([]);
      }
    } catch (e) {
      setRooms(data || []);
    }
  };

  // Reload rooms when the user changes (so recent rooms reflect current user)
  useEffect(() => {
    loadRooms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const createRoom = async () => {
    if (!roomName.trim()) return;
    setLoading(true);
    const res = await fetch(`${API}/api/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: roomName, createdBy: user?.userId })
    });
    const data = await res.json();
    setLoading(false);
    if (data?.id) navigate(`/room/${data.id}`);
  };

  const joinRoom = () => {
    if (!roomCode.trim()) return;
    navigate(`/room/${roomCode}`);
  };

  async function createRoomFromModal() {
    if (!modalRoomName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modalRoomName, createdBy: user?.userId })
      });
      const data = await res.json();
      setLoading(false);
      setShowCreateModal(false);
      if (data?.id) navigate(`/room/${data.id}`);
    } catch (err) {
      console.error('createRoomFromModal', err);
      setLoading(false);
    }
  }

  function joinRoomFromModal() {
    if (!modalRoomCode.trim()) return;
    setShowJoinModal(false);
    navigate(`/room/${modalRoomCode}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="border-b border-slate-700/50 px-6 py-4 flex items-center justify-between bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white font-semibold shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div className="text-xl font-bold bg-gradient-to-r from-purple-400 to-indigo-400 bg-clip-text text-transparent">
              CodeCollab
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-400 flex items-center justify-center text-xs font-semibold text-slate-900">
                  {initials}
                </div>
                <span className="text-sm text-slate-200">{user.username}</span>
              </div>
              <button
                className="btn-outline hover:bg-red-500/10 hover:border-red-500/50 hover:text-red-400 transition-all duration-200"
                onClick={() => {
                  try { localStorage.removeItem('user'); } catch (e) { /* ignore */ }
                  setUser?.(null);
                  window.location.href = '/auth';
                }}
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="grid lg:grid-cols-2 gap-12 items-start mb-16">
          {/* Hero + Controls column */}
          <div className="flex flex-col items-center justify-center space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-6xl p-5 font-bold  bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Code Together
              </h1>
              <p className="text-xl text-slate-400 max-w-xl mx-auto leading-relaxed">
                Real-time code editing, interactive whiteboards, and seamless collaboration for developers and teams.
              </p>
            </div>

            <div className="w-full max-w-2xl space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Create Room Card */}
                <div className="group relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative bg-slate-800/90 p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-purple-500/10">
                        <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-200">Create Room</h3>
                    </div>
                    <p className="text-sm text-slate-400 mb-6">Start a new collaboration session</p>
                    <button 
                      className="w-full btn-primary bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 border-0 text-white shadow-lg shadow-purple-500/25"
                      onClick={() => { setModalRoomName(''); setShowCreateModal(true); }}
                    >
                      Create New Room
                    </button>
                  </div>
                </div>

                {/* Join Room Card */}
                <div className="group relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                  <div className="relative bg-slate-800/90 p-6 rounded-xl border border-slate-700/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 rounded-lg bg-cyan-500/10">
                        <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-200">Join Room</h3>
                    </div>
                    <p className="text-sm text-slate-400 mb-6">Enter an existing room ID</p>
                    <button 
                      className="w-full btn bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 border-0 text-white shadow-lg shadow-cyan-500/25"
                      onClick={() => { setModalRoomCode(''); setShowJoinModal(true); }}
                    >
                      Join Existing Room
                    </button>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm text-slate-500">
                  Tip: Copy room IDs from Recent Rooms below to share with teammates
                </p>
              </div>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="group bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 hover:border-purple-500/30 transition-all duration-300 hover:transform hover:-translate-y-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10">
                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-200">Real-time Editor</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Monaco Editor with live collaboration, syntax highlighting, and multi-language support.
              </p>
            </div>

            <div className="group bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 hover:border-cyan-500/30 transition-all duration-300 hover:transform hover:-translate-y-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-200">Whiteboard</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Draw diagrams, explain concepts, and brainstorm ideas together in real-time.
              </p>
            </div>

            <div className="group bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 hover:border-emerald-500/30 transition-all duration-300 hover:transform hover:-translate-y-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-500/10 to-green-500/10">
                  <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-200">Live Chat</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Instant messaging with markdown support, code snippets, and emoji reactions.
              </p>
            </div>

            <div className="group bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 hover:border-amber-500/30 transition-all duration-300 hover:transform hover:-translate-y-1">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10">
                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-slate-200">User Presence</h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                See who's online, track cursor positions, and collaborate with live awareness.
              </p>
            </div>
          </div>
        </div>

        {rooms.length > 0 && (
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-slate-200">Recent Rooms</h3>
              <button 
                onClick={loadRooms}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {rooms.map((r) => (
                <div key={r.id} className="group bg-slate-800/50 p-5 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-all duration-300 hover:transform hover:-translate-y-1">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-slate-200 truncate flex-1">{r.name}</h4>
                    <button 
                      onClick={() => { navigator.clipboard?.writeText(r.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-slate-700/50 rounded-lg ml-2"
                      title="Copy room ID"
                    >
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-slate-500 mb-4">
                    Created {new Date(r.createdAt).toLocaleDateString()} at {new Date(r.createdAt).toLocaleTimeString()}
                  </div>
                  <button 
                    className="w-full btn bg-slate-700/50 hover:bg-slate-600/50 border-slate-600 text-slate-200 hover:text-white transition-all"
                    onClick={() => navigate(`/room/${r.id}`)}
                  >
                    Open Room
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create Room Modal */}
        {showCreateModal && (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) setShowCreateModal(false); }}>
            <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header flex items-center justify-between p-6 border-b border-slate-700">
                <h3 className="text-xl font-semibold text-slate-200">Create New Room</h3>
                <button className="btn-ghost p-2 hover:bg-slate-700 rounded-lg" onClick={() => setShowCreateModal(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6">
                <label className="block text-sm font-medium text-slate-400 mb-3">Room Name</label>
                <input 
                  autoFocus 
                  className="input w-full bg-slate-800 border-slate-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
                  placeholder="e.g., Pair Programming Session"
                  value={modalRoomName}
                  onChange={(e) => setModalRoomName(e.target.value)}
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter') createRoomFromModal(); 
                    if (e.key === 'Escape') setShowCreateModal(false); 
                  }}
                />
                <div className="modal-actions mt-6 flex justify-end gap-3">
                  <button className="btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
                  <button 
                    className="btn-primary bg-gradient-to-r from-purple-500 to-indigo-500 border-0"
                    onClick={createRoomFromModal} 
                    disabled={!modalRoomName.trim() || loading}
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Creating...
                      </>
                    ) : 'Create Room'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Join Room Modal */}
        {showJoinModal && (
          <div className="modal-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target.classList.contains('modal-overlay')) setShowJoinModal(false); }}>
            <div className="modal max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header flex items-center justify-between p-6 border-b border-slate-700">
                <h3 className="text-xl font-semibold text-slate-200">Join Room</h3>
                <button className="btn-ghost p-2 hover:bg-slate-700 rounded-lg" onClick={() => setShowJoinModal(false)}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6">
                <label className="block text-sm font-medium text-slate-400 mb-3">Room ID</label>
                <input 
                  autoFocus 
                  className="input w-full bg-slate-800 border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                  placeholder="Enter room ID (e.g., abc123)"
                  value={modalRoomCode}
                  onChange={(e) => setModalRoomCode(e.target.value)}
                  onKeyDown={(e) => { 
                    if (e.key === 'Enter') joinRoomFromModal(); 
                    if (e.key === 'Escape') setShowJoinModal(false); 
                  }}
                />
                <div className="modal-actions mt-6 flex justify-end gap-3">
                  <button className="btn-ghost" onClick={() => setShowJoinModal(false)}>Cancel</button>
                  <button 
                    className="btn bg-gradient-to-r from-cyan-500 to-blue-500 border-0"
                    onClick={joinRoomFromModal} 
                    disabled={!modalRoomCode.trim()}
                  >
                    Join Room
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}