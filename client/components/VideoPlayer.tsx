import React, { useEffect, useRef, useState } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { supabase } from '@/lib/supabase';
import { PlayCircle, AlertCircle, Maximize, Minimize, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Room {
  id: string;
  room_name: string;
  current_url: string;
  is_playing: boolean;
  playback_time: number;
  host_id: string;
}

interface VideoPlayerProps {
  room: Room;
  userId: string;
}

interface ToastMessage {
  id: string;
  user_email: string;
  text: string;
}

const createSyntheticStream = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.fillRect(0, 0, 1, 1);
  return canvas.captureStream(1); 
};

export default function VideoPlayer({ room, userId }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  
  // Track this in a ref so it doesn't trigger re-renders in our useEffects
  const viewerHasJoinedRef = useRef(false);
  const isInitialized = useRef(false); 
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerHasJoined, setViewerHasJoined] = useState(false);
  const [peerError, setPeerError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [micAvailable, setMicAvailable] = useState(false);
  const [activeVoiceStreams, setActiveVoiceStreams] = useState<MediaStream[]>([]);
  
  const isHost = room.host_id === userId;
  
  // CRITICAL FIX: Lock the random ID on initial mount so React doesn't recalculate it on re-renders
  const [myPeerId] = useState(() => 
    isHost ? `sye-host-${room.id}` : `sye-viewer-${userId}-${Math.floor(Math.random() * 1000)}`
  );

  useEffect(() => {
    if (isHost) supabase.from('rooms').update({ is_playing: false }).eq('id', room.id);
  }, [isHost, room.id]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getAudioTracks()[0].enabled = false; 
        voiceStreamRef.current = stream;
        setMicAvailable(true);
      })
      .catch(err => {
        console.warn("[Voice] Microphone locked or denied:", err);
        setMicAvailable(false);
      });
  }, []);

  const toggleMic = () => {
    if (voiceStreamRef.current && micAvailable) {
      const audioTrack = voiceStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicMuted(!audioTrack.enabled);
    }
  };

  const addVoiceStream = (newStream: MediaStream) => {
    setActiveVoiceStreams(prev => {
      if (prev.some(s => s.id === newStream.id)) return prev;
      return [...prev, newStream];
    });
  };

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(console.error);
    else document.exitFullscreen();
  };

  useEffect(() => {
    if (!isFullscreen) {
      setToastMessages([]);
      return;
    }
    const channel = supabase
      .channel(`fullscreen-chat-${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` }, (payload) => {
          const newToast: ToastMessage = { id: payload.new.id, user_email: payload.new.user_email, text: payload.new.message_text };
          setToastMessages(prev => [...prev.slice(-2), newToast]);
          setTimeout(() => setToastMessages(prev => prev.filter(msg => msg.id !== newToast.id)), 5000);
      }).subscribe();
    return () => { channel.unsubscribe(); };
  }, [isFullscreen, room.id]);


  // -------------- SIGNALING (SUPABASE WEBSOCKETS) --------------
  useEffect(() => {
    const channel = supabase.channel(`webrtc-signaling-${room.id}`);
    signalingChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'knock-for-screen' }, (payload) => {
        if (isHost && streamRef.current && peerRef.current) {
          console.log(`[Host] Calling viewer ${payload.payload.peerId} with 60fps stream...`);
          peerRef.current.call(payload.payload.peerId, streamRef.current, { metadata: { type: 'screen' } });
        }
      })
      .on('broadcast', { event: 'voice-ping' }, (payload) => {
        if (payload.payload.peerId !== myPeerId && voiceStreamRef.current && peerRef.current) {
          peerRef.current.call(payload.payload.peerId, voiceStreamRef.current, { metadata: { type: 'voice' } });
        }
      })
      .on('broadcast', { event: 'host-ready' }, () => {
        // Use the ref here so this effect doesn't need to rebuild when state changes
        if (!isHost && viewerHasJoinedRef.current) {
          channel.send({ type: 'broadcast', event: 'knock-for-screen', payload: { peerId: myPeerId } });
        }
      })
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [isHost, room.id, myPeerId]); // Removed viewerHasJoined dependency to prevent channel teardowns


  // -------------- PEERJS ENGINE (MEDIA ONLY) --------------
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // The ID is now permanently stable across re-renders
    const peer = new Peer(myPeerId, { debug: 2 }); 
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log(`[PeerJS] Connected to signaling server! Stable ID: ${id}`);
      setTimeout(() => {
        signalingChannelRef.current?.send({ type: 'broadcast', event: 'voice-ping', payload: { peerId: id } });
      }, 1000);
    });

    peer.on('call', (call: MediaConnection) => {
      if (call.metadata?.type === 'voice') {
        call.answer(voiceStreamRef.current || undefined);
        call.on('stream', remoteStream => addVoiceStream(remoteStream));
      } 
      else if (call.metadata?.type === 'screen' && !isHost) {
        console.log('[Viewer] Incoming stream from Host! Answering with Synthetic Stream.');
        
        const fallbackStream = voiceStreamRef.current || createSyntheticStream();
        call.answer(fallbackStream); 
        
        call.on('stream', (hostStream) => {
          console.log('[Viewer] SUCCESS: Received 60fps Host Stream!');
          if (videoRef.current) {
            videoRef.current.srcObject = hostStream;
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play().catch(e => console.error("[Viewer] Playback blocked by browser:", e));
            };
          }
        });
      }
    });

    peer.on('error', (err) => {
      console.error('[PeerJS Error]:', err);
      if (err.type !== 'peer-unavailable') setPeerError(`Connection Error: ${err.message}`);
    });

    return () => {
      peer.destroy();
      isInitialized.current = false;
    };
  }, [isHost, myPeerId]);

  const handleViewerJoin = () => {
    if (isHost || !peerRef.current) return;
    
    setViewerHasJoined(true);
    viewerHasJoinedRef.current = true; // Sync ref for the Supabase callback
    
    console.log("[Viewer] Sending secure knock via Supabase...");
    signalingChannelRef.current?.send({
      type: 'broadcast',
      event: 'knock-for-screen',
      payload: { peerId: myPeerId }
    });
  };

  const startScreenShare = async () => {
    if (!isHost) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          width: { ideal: 1920, max: 3840 }, 
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 60, max: 60 },
          displaySurface: 'browser' 
        },
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } 
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setIsStreaming(true);

      await supabase.from('rooms').update({ is_playing: true, updated_at: new Date().toISOString() }).eq('id', room.id);
      signalingChannelRef.current?.send({ type: 'broadcast', event: 'host-ready', payload: {} });

      stream.getVideoTracks()[0].onended = async () => {
        setIsStreaming(false);
        streamRef.current = null;
        await supabase.from('rooms').update({ is_playing: false }).eq('id', room.id);
      };
    } catch (err) {
      console.error("Failed to share screen:", err);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="w-full h-full rounded-2xl overflow-hidden glassmorphism shadow-2xl relative border border-white/10 bg-black flex items-center justify-center group"
    >
      {activeVoiceStreams.map((stream, idx) => (
        <audio key={idx} autoPlay ref={el => { if (el) el.srcObject = stream }} />
      ))}
      
      {peerError && (
        <div className="absolute top-4 left-4 right-4 bg-red-500/80 backdrop-blur-md text-white p-3 rounded-lg z-50 flex items-center gap-2">
          <AlertCircle size={20} />
          {peerError}
        </div>
      )}

      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        playsInline
        muted={isHost} 
      />

      {(isStreaming || (viewerHasJoined && room.is_playing)) && (
        <div className="absolute bottom-4 right-4 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 z-40">
          {micAvailable && (
            <button
              onClick={toggleMic}
              className={`p-3 backdrop-blur-md border border-white/10 rounded-xl transition-all ${
                isMicMuted ? 'bg-red-500/20 text-red-400 hover:bg-red-500/40' : 'bg-neon-cyan/20 text-neon-cyan hover:bg-neon-cyan/40 shadow-[0_0_15px_rgba(0,242,254,0.3)]'
              }`}
            >
              {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            className="p-3 bg-black/50 hover:bg-neon-cyan/20 text-white hover:text-neon-cyan backdrop-blur-md border border-white/10 rounded-xl transition-all"
          >
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      )}

      {isFullscreen && (
        <div className="absolute bottom-20 right-4 w-72 flex flex-col items-end gap-2 z-40 pointer-events-none">
          <AnimatePresence>
            {toastMessages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className="bg-black/40 backdrop-blur-md border border-white/10 text-white p-3 rounded-xl shadow-lg pointer-events-auto cursor-pointer hover:bg-black/60"
                style={{ width: 'fit-content', maxWidth: '100%' }}
                onClick={() => document.fullscreenElement && document.exitFullscreen()}
              >
                <div className="text-[10px] text-neon-cyan font-bold mb-1 tracking-wider">
                  {msg.user_email.split('@')[0].toUpperCase()}
                </div>
                <div className="text-sm font-medium leading-tight text-gray-200">{msg.text}</div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {isHost && !isStreaming && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-20">
          <h2 className="text-2xl font-bold text-white mb-4">You are the Host</h2>
          <button onClick={startScreenShare} className="px-6 py-3 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan rounded-xl hover:bg-neon-cyan/40 transition-all font-bold">
            Share Screen & Start Stream
          </button>
        </div>
      )}

      {!isHost && !room.is_playing && !viewerHasJoined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
          <div className="w-12 h-12 border-4 border-neon-cyan border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-neon-cyan font-semibold pulse">Waiting for Host to go live...</p>
        </div>
      )}

      {!isHost && room.is_playing && !viewerHasJoined && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-20">
          <button onClick={handleViewerJoin} className="flex items-center gap-3 px-8 py-4 bg-neon-cyan text-cinema-black rounded-xl hover:bg-[#4facfe] transition-all font-black text-lg shadow-[0_0_30px_rgba(0,242,254,0.5)]">
            <PlayCircle size={28} />
            TUNE IN LIVE
          </button>
        </div>
      )}
    </div>
  );
}