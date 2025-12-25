import { useEffect, useRef, useState } from 'react';
import { socket } from '../lib/socket.js';

export default function ChatPanel({ roomId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  useEffect(() => {
    socket.emit('chat:history', { roomId }, (data) => setMessages(data || []));

    const onNew = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const onCleared = () => {
      setMessages([]);
    };

    socket.on('chat:new', onNew);
    socket.on('chat:cleared', onCleared);
    return () => {
      socket.off('chat:new', onNew);
      socket.off('chat:cleared', onCleared);
    };
  }, [roomId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = () => {
    if (!text.trim()) return;
    socket.emit('chat:send', { roomId, message: text }, () => {
      setText('');
    });
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>Chat</div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-xs text-xs"
            title="Clear chat"
            onClick={() => {
              const ok = window.confirm('Clear all chat messages for this room? This cannot be undone.');
              if (!ok) return;
              socket.emit('chat:clear', { roomId }, (res) => {
                if (res?.error) {
                  alert('Could not clear chat: ' + (res.error || 'unknown'));
                  console.error('chat:clear', res);
                  return;
                }
                // optimistic clear; server will also emit 'chat:cleared' to everyone
                setMessages([]);
              });
            }}
          >
            Clear
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <div className="text-xs text-muted">{m.username} • {new Date(m.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
            <div>{m.message}</div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
      <div className="p-3 border-t border-border flex gap-2">
        <input className="input flex-1" placeholder="Type a message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn" onClick={send} disabled={!text.trim()}>Send</button>
      </div>
    </div>
  );
}
