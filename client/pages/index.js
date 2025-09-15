import { useEffect, useState } from 'react';
import ChatRoom from '../components/ChatRoom';

export default function Home() {
  const [roomId, setRoomId] = useState('public-room');
  const [token, setToken] = useState(null);

  useEffect(() => {
    // demo: create guest token via API or store after login
    // for now we will keep token null and show simple auth form
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] to-[#0b1221] text-white p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-12 gap-6">
        <aside className="col-span-3 bg-white/5 rounded-2xl p-4">
          <h2 className="text-lg font-semibold mb-4">Rooms</h2>
          <ul className="space-y-2">
            <li>
              <button onClick={() => setRoomId('public-room')}
                className={`w-full text-left px-3 py-2 rounded ${roomId==='public-room' ? 'bg-[#6C5CE7]/30' : 'hover:bg-white/3'}`}>
                Public Room
              </button>
            </li>
            <li>
              <button onClick={() => setRoomId('tech')}
                className={`w-full text-left px-3 py-2 rounded ${roomId==='tech' ? 'bg-[#6C5CE7]/30' : 'hover:bg-white/3'}`}>
                Tech
              </button>
            </li>
            <li>
              <button onClick={() => setRoomId('random')}
                className={`w-full text-left px-3 py-2 rounded ${roomId==='random' ? 'bg-[#6C5CE7]/30' : 'hover:bg-white/3'}`}>
                Random
              </button>
            </li>
          </ul>
        </aside>

        <main className="col-span-6 bg-white/3 rounded-2xl p-0 overflow-hidden" style={{height: '75vh'}}>
          <div className="p-4 border-b border-white/10 bg-white/5">
            <h3 className="text-xl">Room: {roomId}</h3>
          </div>
          <div style={{height: 'calc(75vh - 64px)'}}>
            <ChatRoom roomId={roomId} token={token} />
          </div>
        </main>

        <div className="col-span-3 bg-white/5 rounded-2xl p-4">
          <h3 className="text-lg mb-2">Room Info</h3>
          <p className="text-sm text-white/70">Owner: admin</p>
          <p className="mt-4 text-sm">Use the admin panel to create rooms and manage moderators.</p>
        </div>
      </div>
    </div>
  );
}
