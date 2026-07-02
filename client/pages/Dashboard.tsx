import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { Plus, LogOut, Play, RefreshCw } from 'lucide-react';
import CreateRoomModal from '@/components/CreateRoomModal';
import Logo from '@/components/Logo';

interface Room {
  id: string;
  room_name: string;
  current_url: string;
  is_playing: boolean;
  playback_time: number;
  host_id: string;
}

interface Profile {
  watch_time_hours: number;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      try {
        // Fetch user profile
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profileError) {
          console.warn('Profile fetch warning:', profileError);
        } else if (profileData) {
          setProfile(profileData);
        }

        // Fetch all rooms with error logging
        const { data: roomsData, error: roomsError } = await supabase
          .from('rooms')
          .select('*');

        if (roomsError) {
          console.error('Error fetching rooms:', roomsError);
        } else if (roomsData) {
          console.log('Rooms fetched:', roomsData.length);
          setRooms(roomsData as Room[]);
        }
      } catch (err) {
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Subscribe to room changes
    const roomsSubscription = supabase
      .channel('rooms-changes', { config: { broadcast: { self: true } } })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'rooms' },
        (payload: any) => {
          console.log('New room inserted:', payload.new);
          setRooms((prev) => [payload.new as Room, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms' },
        (payload: any) => {
          console.log('Room updated:', payload.new);
          setRooms((prev) =>
            prev.map((room) => (room.id === payload.new.id ? (payload.new as Room) : room))
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'rooms' },
        (payload: any) => {
          console.log('Room deleted:', payload.old.id);
          setRooms((prev) => prev.filter((room) => room.id !== payload.old.id));
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
      });

    return () => {
      roomsSubscription.unsubscribe();
    };
  }, [user, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const handleJoinRoom = (roomId: string) => {
    navigate(`/arena/${roomId}`);
  };

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const { data: roomsData, error: roomsError } = await supabase
        .from('rooms')
        .select('*');

      if (roomsError) {
        console.error('Error fetching rooms:', roomsError);
      } else if (roomsData) {
        console.log('Rooms refreshed:', roomsData.length);
        setRooms(roomsData as Room[]);
      }
    } catch (err) {
      console.error('Error refreshing rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.4 },
    },
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-cinema-black via-cinema-dark to-cinema-black overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 left-1/4 w-96 h-96 bg-neon-cyan/5 rounded-full blur-3xl"
          animate={{ y: [0, -30, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-0 right-1/4 w-96 h-96 bg-neon-purple/5 rounded-full blur-3xl"
          animate={{ y: [0, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative z-10"
      >
        {/* Header */}
        <header className="border-b border-white/10 backdrop-blur-md bg-white/2">
          <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
            
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <Logo size="md" />
            </motion.div>

            <div className="flex items-center gap-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-sm text-muted-foreground"
              >
                {user?.email}
              </motion.div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRefresh}
                disabled={loading}
                className="btn-secondary-cinema flex items-center gap-2 disabled:opacity-50"
                title="Refresh streams"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleLogout}
                className="btn-secondary-cinema flex items-center gap-2"
              >
                <LogOut size={16} />
                Logout
              </motion.button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-6 py-12 space-y-12">
          {/* Insights Panel */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="glassmorphism rounded-xl p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Watch Time</h3>
              <p className="text-4xl font-bold text-neon-cyan">
                {profile?.watch_time_hours.toFixed(1) || '0.0'}h
              </p>
            </div>
            <div className="glassmorphism rounded-xl p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Active Rooms</h3>
              <p className="text-4xl font-bold text-neon-purple">{rooms.length}</p>
            </div>
            <div className="glassmorphism rounded-xl p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Status</h3>
              <p className="text-lg font-semibold text-neon-cyan flex items-center gap-2">
                <span className="w-2 h-2 bg-neon-cyan rounded-full animate-pulse" />
                Online
              </p>
            </div>
          </motion.div>

          {/* Stream Directory */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <div className="flex items-center justify-between">
              <motion.h2
                variants={itemVariants}
                className="text-2xl font-bold text-foreground"
              >
                Stream Directory
              </motion.h2>
              <motion.button
                variants={itemVariants}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowCreateModal(true)}
                className="btn-primary-cinema flex items-center gap-2"
              >
                <Plus size={18} />
                Create Stream
              </motion.button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="w-8 h-8 border-2 border-neon-cyan border-transparent border-t-neon-cyan rounded-full mx-auto mb-4"
                />
                Loading streams...
              </div>
            ) : rooms.length === 0 ? (
              <motion.div
                variants={itemVariants}
                className="glassmorphism rounded-xl p-12 text-center"
              >
                <p className="text-muted-foreground mb-4">No active streams yet</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="btn-primary-cinema inline-flex items-center gap-2"
                >
                  <Plus size={16} />
                  Create the first one
                </button>
              </motion.div>
            ) : (
              <motion.div
                variants={containerVariants}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                {rooms.map((room) => (
                  <motion.div
                    key={room.id}
                    variants={itemVariants}
                    whileHover={{ scale: 1.02 }}
                    onClick={() => handleJoinRoom(room.id)}
                    className="glassmorphism rounded-xl overflow-hidden cursor-pointer group"
                  >
                    {/* Thumbnail */}
                    <div className="w-full h-40 bg-gradient-to-br from-neon-cyan/10 to-neon-purple/10 flex items-center justify-center relative overflow-hidden">
                      <div className="absolute inset-0 bg-black/20" />
                      <motion.div
                        whileHover={{ scale: 1.2 }}
                        className="relative z-10"
                      >
                        <Play
                          size={48}
                          className="text-neon-cyan/60 group-hover:text-neon-cyan transition-colors"
                        />
                      </motion.div>
                    </div>

                    {/* Content */}
                    <div className="p-4 space-y-3">
                      <h3 className="font-semibold text-foreground truncate">
                        {room.room_name}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">
                        {room.current_url}
                      </p>
                      <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <span className="text-xs text-muted-foreground">
                          {room.is_playing ? '🔴 Live' : '⏸ Paused'}
                        </span>
                        <span className="text-xs font-mono text-neon-cyan">
                          {Math.floor(room.playback_time)}s
                        </span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </motion.div>
        </div>
      </motion.div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          userId={user?.id || ''}
        />
      )}
    </div>
  );
}