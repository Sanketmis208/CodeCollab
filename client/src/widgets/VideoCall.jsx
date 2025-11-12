import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';

/**
 * A generic component to render any video stream (local or remote).
 * It handles the video element, name tags, and status icons.
 */
function VideoTile({
  stream,
  userId,
  isLocal = false,
  isMuted = false,
  isVideoOff = false,
  isPinned = false,
  onClick = () => {},
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
      ref.current.muted = isLocal; // Only mute local stream
      try {
        ref.current.play();
      } catch (e) {
        console.error('Video play error:', e);
      }
    }
  }, [stream, isLocal]);

  return (
    <div
      className="relative bg-slate-800 rounded overflow-hidden aspect-video cursor-pointer"
      onClick={onClick}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />
      {isVideoOff && (
        <div className="absolute inset-0 flex items-center justify-center text-muted text-sm">
          Video off
        </div>
      )}
      <div className="absolute bottom-2 left-2 text-xs bg-black/40 px-2 py-1 rounded">
        {userId?.slice(0, 6) || 'You'}
      </div>
      {/* Show pin icon */}
      {isPinned && (
        <div className="absolute top-2 left-2 text-lg" title="Pinned">
          📌
        </div>
      )}
      {/* Show mute icon (only if applicable) */}
      {isMuted && (
        <div className="absolute top-2 right-2 text-lg" title="Muted">
          🎤
        </div>
      )}
    </div>
  );
}

/**
 * Wrapper component for remote user tiles.
 * In a real app, this would also listen for remote mute/video status.
 */
function Remote({ userId, stream, ...props }) {
  // TODO: Add logic to get remote user's mute/video status
  const isRemoteMuted = false;
  const isRemoteVideoOff = false;

  return (
    <VideoTile
      stream={stream}
      userId={userId}
      isMuted={isRemoteMuted}
      isVideoOff={isRemoteVideoOff}
      {...props}
    />
  );
}

export default function VideoCall({ roomId, participants, self }) {
  const [inCall, setInCall] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState(new Map()); // userId -> MediaStream
  const [error, setError] = useState('');
  const [devices, setDevices] = useState({ audio: [], video: [] });
  const [selected, setSelected] = useState({ audio: null, video: null });

  // --- NEW: Layout State ---
  const [layoutMode, setLayoutMode] = useState('grid'); // 'grid' | 'spotlight'
  const [pinnedUserId, setPinnedUserId] = useState(null);
  const [activeSpeakerId, setActiveSpeakerId] = useState(null);

  const pcMap = useRef(new Map()); // userId -> RTCPeerConnection
  const localStreamRef = useRef(null);
  
  // (We no longer need localVideoRef, VideoTile handles its own ref)

  // --- Helpers ---
  const createPeer = (remoteUserId) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => {
        try { pc.addTrack(t, localStreamRef.current); } catch(e) {}
      });
    }

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        socket.emit('webrtc:signal', {
          roomId,
          toUserId: remoteUserId,
          data: { candidate: ev.candidate }
        });
      }
    };

    pc.ontrack = (ev) => {
      let stream;
      if (ev.streams && ev.streams.length) {
        stream = ev.streams[0];
      } else {
        stream = new MediaStream();
        if (ev.track) stream.addTrack(ev.track);
        if (ev.streams === undefined && ev.getTracks) {
          try {
            ev.getTracks().forEach(t => stream.addTrack(t));
          } catch (e) {}
        }
      }
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(remoteUserId, stream);
        return next;
      });
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (['failed', 'disconnected', 'closed'].includes(state)) {
        setRemoteStreams(prev => { const n = new Map(prev); n.delete(remoteUserId); return n; });
        pcMap.current.delete(remoteUserId);
        try { pc.close(); } catch (e) {}
      }
    };

    pcMap.current.set(remoteUserId, pc);
    return pc;
  };

  // --- Signaling handler ---
  useEffect(() => {
    let mounted = true;

    const onSignal = async ({ fromUserId, data }) => {
      if (!mounted) return;
      if (!inCall) return;
      let pc = pcMap.current.get(fromUserId);
      if (!pc) pc = createPeer(fromUserId);

      if (data?.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => {
            try { pc.addTrack(t, localStreamRef.current); } catch (e) {}
          });
        }
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:signal', { roomId, toUserId: fromUserId, data: pc.localDescription });
        return;
      }

      if (data?.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(data));
        return;
      }

      if (data?.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {}
      }
    };

    socket.on('webrtc:signal', onSignal);

    navigator.mediaDevices?.enumerateDevices?.().then(list => {
      if (!mounted) return;
      const audio = list.filter(d => d.kind === 'audioinput');
      const video = list.filter(d => d.kind === 'videoinput');
      setDevices({ audio, video });
      setSelected({ audio: audio[0]?.deviceId || null, video: video[0]?.deviceId || null });
    }).catch(() => {});

    return () => {
      mounted = false;
      socket.off('webrtc:signal', onSignal);
    };
  }, [inCall, roomId]);

  // --- Participant Change Handlers ---
  useEffect(() => {
    if (!inCall) return;
    participants.filter(uid => uid !== self?.userId).forEach(async (uid) => {
      if (!pcMap.current.has(uid)) {
        const pc = createPeer(uid);
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => {
            try { pc.addTrack(t, localStreamRef.current); } catch (e) {}
          });
        }
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:signal', { roomId, toUserId: uid, data: pc.localDescription });
        } catch (e) {
          setError(`Failed to create offer for ${uid.slice(0, 6)}...`);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participants, inCall, roomId, self?.userId]);
  
  useEffect(() => {
    if (!inCall) return;
    const remoteUserIds = participants.filter(uid => uid !== self?.userId);
    const activePeerIds = Array.from(pcMap.current.keys());
    
    activePeerIds.forEach(peerId => {
        if (!remoteUserIds.includes(peerId)) {
            const pc = pcMap.current.get(peerId);
            if (pc) {
                try { pc.close(); } catch (e) {}
            }
            pcMap.current.delete(peerId);
            setRemoteStreams(prev => {
                const n = new Map(prev);
                n.delete(peerId);
                return n;
            });
            // Unpin if the pinned user leaves
            if (pinnedUserId === peerId) {
                setPinnedUserId(null);
            }
        }
    });
  }, [participants, inCall, self?.userId, pinnedUserId]);

  // --- Start/Stop Call ---
  const startCall = async () => {
    setError('');
    const constraints = {
      audio: selected.audio ? { deviceId: { exact: selected.audio } } : true,
      video: selected.video ? { deviceId: { exact: selected.video } } : true
    };
    
    if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      pcMap.current.forEach(pc => {
        try {
          stream.getTracks().forEach(t => pc.addTrack(t, stream));
        } catch (e) {}
      });
      setInCall(true);
    } catch (err) {
      setError('Unable to access camera or microphone. Check permissions and that devices are not in use.');
    }
  };

  const endCall = () => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    pcMap.current.forEach(pc => {
      try { pc.close(); } catch (e) {}
    });
    pcMap.current.clear();
    setRemoteStreams(new Map());
    setInCall(false);
    setIsMuted(false);
    setIsVideoOff(false);
    setPinnedUserId(null);
    setLayoutMode('grid');
  };
  
  // --- Device Change Handlers (during call) ---
  useEffect(() => {
    if (!inCall || !localStreamRef.current || !selected.audio) return;
    
    const switchAudio = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: { deviceId: { exact: selected.audio } } 
            });
            const newAudioTrack = stream.getAudioTracks()[0];
            if (!newAudioTrack) throw new Error('No audio track found');

            const oldTrack = localStreamRef.current.getAudioTracks()[0];
            if (oldTrack) {
                oldTrack.stop();
                localStreamRef.current.removeTrack(oldTrack);
            }
            
            localStreamRef.current.addTrack(newAudioTrack);
            
            for (const pc of pcMap.current.values()) {
                const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                if (sender) await sender.replaceTrack(newAudioTrack);
            }
            newAudioTrack.enabled = !isMuted;
        } catch (e) {
            setError('Could not switch audio device');
        }
    };
    switchAudio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.audio]); 

  useEffect(() => {
    if (!inCall || !localStreamRef.current || !selected.video) return;
    
    const switchVideo = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { deviceId: { exact: selected.video } } 
            });
            const newVideoTrack = stream.getVideoTracks()[0];
            if (!newVideoTrack) throw new Error('No video track found');
            
            const oldTrack = localStreamRef.current.getVideoTracks()[0];
            if (oldTrack) {
                oldTrack.stop();
                localStreamRef.current.removeTrack(oldTrack);
            }
            
            localStreamRef.current.addTrack(newVideoTrack);
            
            // localVideoRef.current.srcObject is no longer used, 
            // VideoTile's useEffect will pick up the new stream prop
            
            for (const pc of pcMap.current.values()) {
                const sender = pc.getSenders().find(s => s.track?.kind === 'video');
                if (sender) await sender.replaceTrack(newVideoTrack);
            }
            newVideoTrack.enabled = !isVideoOff;
        } catch (e) {
            setError('Could not switch video device');
        }
    };
    switchVideo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.video]); 

  // --- Controls ---
  const toggleMute = () => {
    const t = localStreamRef.current?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsMuted(!t.enabled); }
  };
  const toggleVideo = () => {
    const t = localStreamRef.current?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; setIsVideoOff(!t.enabled); }
  };

  // --- NEW: Layout Handlers ---
  const handlePinClick = (userId) => {
    if (layoutMode === 'grid') {
      // In grid, clicking pins and switches to spotlight
      setLayoutMode('spotlight');
      setPinnedUserId(userId);
    } else {
      // In spotlight, clicking toggles the pin
      if (pinnedUserId === userId) {
        setPinnedUserId(null); // Unpin
      } else {
        setPinnedUserId(userId); // Pin new user
      }
    }
  };

  // --- NEW: Active Speaker Simulation ---
  // In a real app, you would remove this and use a socket event
  // to setActiveSpeakerId(userId)
  useEffect(() => {
    if (!inCall || layoutMode !== 'spotlight' || pinnedUserId) {
      // Don't run if not in call, not in spotlight, or if someone is pinned
      return;
    }
    const allIds = [self?.userId, ...remoteStreams.keys()].filter(Boolean);
    if (allIds.length <= 1) return;

    const interval = setInterval(() => {
      setActiveSpeakerId(prevId => {
        const currentIndex = allIds.indexOf(prevId);
        const nextIndex = (currentIndex + 1) % allIds.length;
        return allIds[nextIndex];
      });
    }, 3000); // Cycle speaker every 3 seconds

    return () => clearInterval(interval);

  }, [inCall, layoutMode, pinnedUserId, remoteStreams, self?.userId]);
  
  const tiles = Array.from(remoteStreams.entries());

  // --- NEW: Grid Layout Renderer ---
  const renderGridLayout = () => {
    const totalTiles = tiles.length + (inCall ? 1 : 0);
    return (
      <div
        className="flex-1 p-2 grid gap-2 overflow-auto"
        style={{
          gridTemplateColumns:
            totalTiles <= 1 ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
        }}
      >
        {inCall && (
          <VideoTile
            stream={localStreamRef.current}
            userId={self?.username || self?.userId}
            isLocal={true}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            isPinned={pinnedUserId === self?.userId}
            onClick={() => handlePinClick(self?.userId)}
          />
        )}
        {tiles.map(([uid, stream]) => (
          <Remote
            key={uid}
            userId={uid}
            stream={stream}
            isPinned={pinnedUserId === uid}
            onClick={() => handlePinClick(uid)}
          />
        ))}
        {!inCall && tiles.length === 0 && (
          <div className="col-span-full h-full flex items-center justify-center text-muted">
            Start a call to see participants
          </div>
        )}
      </div>
    );
  };
  
  // --- NEW: Spotlight Layout Renderer ---
  const renderSpotlightLayout = () => {
    // Determine who is in the main spotlight
    const spotlightUserId = pinnedUserId || activeSpeakerId || self?.userId;
    
    let spotlightStream = null;
    if (spotlightUserId === self?.userId) {
      spotlightStream = localStreamRef.current;
    } else {
      spotlightStream = remoteStreams.get(spotlightUserId);
    }
    
    const isSpotlightLocal = spotlightUserId === self?.userId;
    
    // Everyone else goes in the filmstrip
    const filmstripTiles = tiles.filter(([uid, _]) => uid !== spotlightUserId);
    const localInFilmstrip = inCall && spotlightUserId !== self?.userId;

    return (
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* 1. Main Spotlight View */}
        <div className="flex-1 bg-slate-900 relative p-2">
          {spotlightStream ? (
            <VideoTile
              stream={spotlightStream}
              userId={spotlightUserId}
              isLocal={isSpotlightLocal}
              isMuted={isSpotlightLocal && isMuted}
              isVideoOff={isSpotlightLocal && isVideoOff}
              isPinned={spotlightUserId === pinnedUserId}
              onClick={() => handlePinClick(spotlightUserId)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted">
              {inCall ? 'Loading stream...' : 'Join call to start'}
            </div>
          )}
        </div>

        {/* 2. Filmstrip (Sidebar) */}
        <div className="w-full md:w-48 flex md:flex-col gap-2 p-2 overflow-auto bg-slate-800">
          {localInFilmstrip && (
            <VideoTile
              stream={localStreamRef.current}
              userId={self?.username || self?.userId}
              isLocal={true}
              isMuted={isMuted}
              isVideoOff={isVideoOff}
              isPinned={pinnedUserId === self?.userId}
              onClick={() => handlePinClick(self?.userId)}
            />
          )}
          {filmstripTiles.map(([uid, stream]) => (
            <Remote
              key={uid}
              userId={uid}
              stream={stream}
              isPinned={pinnedUserId === uid}
              onClick={() => handlePinClick(uid)}
            />
          ))}
        </div>
      </div>
    );
  };

  // --- Main Return ---
  return (
    <div className="h-full flex flex-col">
      {error && (
        <div className="p-2 text-sm text-red-400">{error}</div>
      )}
      <div className="p-2 flex items-center gap-2">
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted">Mic:</div>
        <select className="input text-xs w-32" value={selected.audio || ''} onChange={(e) => setSelected(s => ({ ...s, audio: e.target.value || null }))} disabled={inCall}>
          <option value="">Default</option>
          {devices.audio.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
        </select>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted">Cam:</div>
        <select className="input text-xs w-32" value={selected.video || ''} onChange={(e) => setSelected(s => ({ ...s, video: e.target.value || null }))} disabled={inCall}>
          <option value="">Default</option>
          {devices.video.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || d.deviceId}</option>)}
        </select>
      </div>

      {/* --- NEW: Layout Renderer --- */}
      {layoutMode === 'grid' ? renderGridLayout() : renderSpotlightLayout()}
      

      <div className="border-t border-border p-2 flex justify-between items-center gap-2">
        {/* NEW: Layout Toggle Button */}
        <div>
          {inCall && (
            <button
              className="btn btn-sm"
              onClick={() => setLayoutMode(layoutMode === 'grid' ? 'spotlight' : 'grid')}
              title={layoutMode === 'grid' ? 'Switch to Spotlight View' : 'Switch to Grid View'}
            >
              {layoutMode === 'grid' ? 'Grid' : 'Spotlight'}
            </button>
          )}
        </div>
        
        {/* Call Controls */}
        <div className="flex justify-center gap-2">
          {!inCall ? (
            <button className="btn btn-primary" onClick={startCall}>Join Call 📞</button>
          ) : (
            <>
              <button className="btn btn-sm" onClick={toggleMute}>{isMuted ? 'Unmute 🎤' : 'Mute 🎤'}</button>
              <button className="btn btn-sm" onClick={toggleVideo}>{isVideoOff ? 'Video On 📹' : 'Video Off 📹'}</button>
              <button className="btn btn-sm" onClick={endCall}>Leave ☎️</button>
            </>
          )}
        </div>

        {/* Spacer to keep controls centered */}
        <div className="w-24"></div>
      </div>
    </div>
  );
}