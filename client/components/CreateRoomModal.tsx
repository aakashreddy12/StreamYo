import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { motion, AnimatePresence } from 'framer-motion';
import { X, PlayCircle } from 'lucide-react';

interface CreateRoomModalProps {
  onClose: () => void;
  userId: string;
}

export default function CreateRoomModal({ onClose, userId }: CreateRoomModalProps) {
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setError('Please enter a room name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // We no longer need to pass a current_url! 
      // We just assign the room name and mark you as the host.
      const { data, error: insertError } = await supabase
        .from('rooms')
        .insert({
          room_name: roomName.trim(),
          host_id: userId,
          current_url: 'screen-share-mode', // Placeholder to satisfy DB schema
          is_playing: false, 
          playback_time: 0
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (data) {
        onClose();
        // Immediately warp the host into their new Arena
        navigate(`/arena/${data.id}`);
      }
    } catch (err: any) {
      console.error('Error creating room:', err);
      setError(err.message || 'Failed to create room');
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-md glassmorphism rounded-2xl border border-white/10 shadow-2xl overflow-hidden p-6 bg-cinema-dark/90"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-muted-foreground hover:text-white transition-colors"
          >
            <X size={20} />
          </button>

          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <PlayCircle className="text-neon-cyan" />
              Launch Stream
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create a new room. You will be prompted to share your screen inside.
            </p>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">
                Event Name
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g., RCB vs CSK Live"
                className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-neon-cyan transition-colors shadow-inner"
                autoFocus
                disabled={loading}
              />
            </div>

            {error && (
              <motion.p 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                className="text-red-400 text-sm"
              >
                {error}
              </motion.p>
            )}

            <div className="flex gap-3 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white bg-white/5 hover:bg-white/10 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 rounded-xl text-sm font-bold text-cinema-black bg-neon-cyan hover:bg-[#4facfe] transition-colors shadow-[0_0_15px_rgba(0,242,254,0.4)]"
                disabled={loading}
              >
                {loading ? 'Initializing...' : 'Create & Enter'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}