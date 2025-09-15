import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';

export default function ChatRoom({ roomId, token }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const socketRef = useRef(null);
  const listRef = useRef();

  useEffect(() => {
    // create a new socket per mount to avoid stale connections
    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001', {
      autoConnect: false,
      auth: { token }
    });
    socketRef.current = socket;

    socket.onAny((k,v) => {
      // console.log('socket event', k, v);
    });

    socket.connect();

    socket.on('connect_error', (err) => {
      console.error('connect_error', err.message);
    });

    socket.on('message', (msg) => {
      setMessages(prev => [...prev, msg]);
      scrollToBottom();
    });

    socket.on('systemMessage', m => {
      setMessages(prev => [...prev, { system: true, text: m.text }]);
      scrollToBottom();
    });

    socket.on('userKicked', ({ userId }) => {
      // handle if current user was kicked
      console.log('userKicked', userId);
    });

    return () => {
      socket.disconnect();
      socket.off();
    };
  }, [token]);

  useEffect(() => {
    // join the room when it changes
    if (!socketRef.current) return;
    if (!roomId) return;
    socketRef.current.emit('joinRoom', { roomId });
    setMessages([]);
    // load history via REST if you implement that endpoint in server
    // fetch(`/api/rooms/${roomId}/messages`)...
  }, [roomId]);

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 100);
  };

  const send = () => {
    if (!text.trim()) return;
    socketRef.current.emit('message', { roomId, content: text });
    setText('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4">
        {messages.map((m, i) => (
          m.system ? (
            <div key={i} className="text-sm italic text-gray-400 text-center my-2">{m.text}</div>
          ) : (
            <motion.div key={m.id || i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-3">
              <div className="text-xs text-gray-300">{m.author?.username}</div>
              <div className="p-2 rounded-md bg-white/5 inline-block">{m.content}</div>
            </motion.div>
          )
        ))}
        <div ref={listRef} />
      </div>

      <div className="p-3 border-t flex gap-2 bg-black/10">
        <input
          className="flex-1 p-2 rounded bg-white/5 text-white"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          placeholder="Type a message..."
        />
        <button onClick={send} className="px-4 py-2 rounded bg-primary">Send</button>
      </div>
    </div>
  );
}
