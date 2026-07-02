import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Send } from 'lucide-react';

interface Message {
  id: string;
  user_email: string;
  message_text: string;
  created_at: string;
}

interface ChatSidebarProps {
  roomId: string;
  userEmail: string;
  userId: string;
}

export default function ChatSidebar({ roomId, userEmail, userId }: ChatSidebarProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch initial messages and subscribe to new ones
  useEffect(() => {
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true });
      if (data) setMessages(data);
    };

    fetchMessages();

    const channel = supabase
      .channel(`chat-${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as Message])
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [roomId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !userId) return;
    setError('');

    // The column names must perfectly match your Supabase table schema
    const { error: insertError } = await supabase.from('messages').insert({
      room_id: roomId,
      user_id: userId,
      user_email: userEmail,
      message_text: newMessage.trim(),
    });

    if (insertError) {
      console.error('Chat Error:', insertError);
      setError(insertError.message);
    } else {
      setNewMessage('');
    }
  };

  return (
    <div className="w-full h-full glassmorphism rounded-2xl flex flex-col border border-white/10 overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/5">
        <h3 className="font-bold text-neon-cyan flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
          Live Chat
        </h3>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.user_email === userEmail ? 'items-end' : 'items-start'}`}>
            <span className="text-[10px] text-muted-foreground mb-1">{msg.user_email.split('@')[0]}</span>
            <div className={`px-3 py-2 rounded-xl text-sm ${msg.user_email === userEmail ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30' : 'bg-white/5 text-gray-200 border border-white/10'}`}>
              {msg.message_text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="p-4 border-t border-white/10 bg-white/5 space-y-2">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-neon-cyan transition-colors text-white"
          />
          <button type="submit" className="p-2 bg-neon-cyan/20 text-neon-cyan rounded-lg hover:bg-neon-cyan/30 transition-colors">
            <Send size={18} />
          </button>
        </div>
      </form>
    </div>
  );
}