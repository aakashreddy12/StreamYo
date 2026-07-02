import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import VideoPlayer from '@/components/VideoPlayer';
import ChatSidebar from '@/components/ChatSidebar';
import CurtainTransition from '@/components/CurtainTransition';

interface Room {
  id: string;
  room_name: string;
  current_url: string;
  is_playing: boolean;
  playback_time: number;
  host_id: string;
}

export default function Arena() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCurtains, setShowCurtains] = useState(true);

  useEffect(() => {
    if (!user || !roomId) {
      navigate('/dashboard');
      return;
    }

    const fetchRoom = async () => {
      try {
        const { data, error } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single();

        if (error) throw error;
        if (data) {
          setRoom(data as unknown as Room);
        }
      } catch (err) {
        console.error('Error fetching room:', err);
        navigate('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();

    // Subscribe to room updates
    const roomSubscription = supabase
      .channel(`room-${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, (payload: any) => {
        if (payload.new?.id === roomId) {
          setRoom(payload.new as Room);
        } else if (payload.eventType === 'DELETE' && payload.old?.id === roomId) {
          navigate('/dashboard');
        }
      })
      .subscribe();

    return () => {
      roomSubscription.unsubscribe();
    };
  }, [user, roomId, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-cinema-black flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-3 border-neon-cyan border-transparent border-t-neon-cyan rounded-full"
        />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen w-full bg-cinema-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Room not found</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="btn-primary-cinema"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Theater Curtain Transition */}
      {showCurtains && (
        <CurtainTransition
          onComplete={() => setShowCurtains(false)}
        />
      )}

      <div className="min-h-screen w-full bg-gradient-to-br from-cinema-black via-cinema-dark to-cinema-black overflow-hidden">
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-0 left-1/4 w-96 h-96 bg-neon-cyan/5 rounded-full blur-3xl"
            animate={{ y: [0, -30, 0] }}
            transition={{ duration: 20, repeat: Infinity }}
          />
        </div>

        <motion.div
          initial={{ opacity: showCurtains ? 0 : 0.5 }}
          animate={{ opacity: 1 }}
          transition={{ delay: showCurtains ? 1.3 : 0, duration: 0.6 }}
          className="relative z-10 h-screen flex flex-col"
        >
          {/* Header */}
          <header className="border-b border-white/10 backdrop-blur-md bg-white/2 px-6 py-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-between"
            >
              <h1 className="text-2xl font-bold text-foreground">{room.room_name}</h1>
              <button
                onClick={() => navigate('/dashboard')}
                className="btn-secondary-cinema"
              >
                Back to Dashboard
              </button>
            </motion.div>
          </header>

          {/* Main Content */}
          <div className="flex-1 flex gap-4 p-6 overflow-hidden">
            {/* Video Player (75%) */}
            <div className="flex-1 flex items-center justify-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="w-full h-full"
              >
                <VideoPlayer room={room} userId={user?.id || ''} />
              </motion.div>
            </div>

            {/* Chat Sidebar (25%) */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="w-80 flex-shrink-0"
            >
              <ChatSidebar 
  roomId={roomId || ''} 
  userEmail={user?.email || ''} 
  userId={user?.id || ''} 
/>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
