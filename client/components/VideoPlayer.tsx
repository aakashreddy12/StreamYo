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

// ----------------- SYNTHETIC STREAM TRICK -----------------
// Forces Chrome to open the WebRTC media pipeline if no mic is detected
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
  
  // STABLE ID: Initialized once to prevent React re-render loops
  const [myPeerId] = useState(() => 
    isHost ? `sye-host-${room.id}` : `sye-viewer-${userId}-${Math.floor(Math.random() * 1000)}`
  );

  // -------------- INIT & HARDWARE --------------
  useEffect(() => {
    if (isHost) supabase.from('rooms').update({ is_playing: false }).eq('id', room.id);
    
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getAudioTracks()[0].enabled = false; 
        voiceStreamRef.current = stream;
        setMicAvailable(true);
      })
      .catch(() => setMicAvailable(false));
  }, [isHost, room.id]);

  const toggleMic = () => {
    if (voiceStreamRef.current && micAvailable) {
      const audioTrack = voiceStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicMuted(!audioTrack.enabled);
    }
  };

  const addVoiceStream = (newStream: MediaStream) => {
    setActiveVoiceStreams(prev => prev.some(s => s.id === newStream.id) ? prev : [...prev, newStream]);
  };

  // -------------- FULLSCREEN & TOASTS --------------
  useEffect(() => {
    const handleFullscreen = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen().catch(console.error);
    else document.exitFullscreen();
  };

  useEffect(() => {
    if (!isFullscreen) return;
    const channel = supabase.channel(`fullscreen-chat-${room.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}` }, (payload) => {
          const newToast = { id: payload.new.id, user_email: payload.new.user_email, text: payload.new.message_text };
          setToastMessages(prev => [...prev.slice(-2), newToast]);
          setTimeout(() => setToastMessages(prev => prev.filter(msg => msg.id !== newToast.id)), 5000);
      }).subscribe();
    return () => { channel.unsubscribe(); };
  }, [isFullscreen, room.id]);

  // -------------- PEERJS & SIGNALING --------------
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // SIGNALING CHANNEL
    const channel = supabase.channel(`webrtc-signaling-${room.id}`);
    signalingChannelRef.current = channel;

    channel
      .on('broadcast', { event: 'knock-for-screen' }, (payload) => {
        if (isHost && streamRef.current && peerRef.current) {
          peerRef.current.call(payload.payload.peerId, streamRef.current, { metadata: { type: 'screen' } });
        }
      })
      .on('broadcast', { event: 'voice-ping' }, (payload) => {
        if (payload.payload.peerId !== myPeerId && voiceStreamRef.current && peerRef.current) {
          peerRef.current.call(payload.payload.peerId, voiceStreamRef.current, { metadata: { type: 'voice' } });
        }
      })
      .on('broadcast', { event: 'host-ready' }, () => {
        if (!isHost && viewerHasJoinedRef.current) {
          channel.send({ type: 'broadcast', event: 'knock-for-screen', payload: { peerId: myPeerId } });
        }
      })
      .subscribe();

    // PEERJS
    const peer = new Peer(myPeerId, { debug: 2 }); 
    peerRef.current = peer;

    peer.on('open', () => {
      setTimeout(() => channel.send({ type: 'broadcast', event: 'voice-ping', payload: { peerId: myPeerId } }), 1000);
    });

    peer.on('call', (call: MediaConnection) => {
      if (call.metadata?.type === 'voice') {
        call.answer(voiceStreamRef.current || undefined);
        call.on('stream', remoteStream => addVoiceStream(remoteStream));
      } 
      else if (call.metadata?.type === 'screen' && !isHost) {
        call.answer(voiceStreamRef.current || createSyntheticStream()); 
        call.on('stream', (hostStream) => {
          if (videoRef.current) {
            videoRef.current.srcObject = hostStream;
            videoRef.current.onloadedmetadata = () => videoRef.current?.play().catch(console.error);
          }
        });
      }
    });

    return () => { peer.destroy(); channel.unsubscribe(); isInitialized.current = false; };
  }, [isHost, myPeerId, room.id]);

  const handleViewerJoin = () => {
    setViewerHasJoined(true);
    viewerHasJoinedRef.current = true;
    signalingChannelRef.current?.send({ type: 'broadcast', event: 'knock-for-screen', payload: { peerId: myPeerId } });
  };

  const startScreenShare = async () => {
    if (!isHost) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } 
      });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      setIsStreaming(true);
      await supabase.from('rooms').update({ is_playing: true }).eq('id', room.id);
      signalingChannelRef.current?.send({ type: 'broadcast', event: 'host-ready', payload: {} });
      stream.getVideoTracks()[0].onended = async () => {
        setIsStreaming(false);
        await supabase.from('rooms').update({ is_playing: false }).eq('id', room.id);
      };
    } catch (err) { console.error(err); }
  };

  return (
    <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden glassmorphism shadow-2xl relative border border-white/10 bg-black flex items-center justify-center group">
      {activeVoiceStreams.map((stream, idx) => <audio key={idx} autoPlay ref={el => { if (el) el.srcObject = stream }} />)}
      
      <video ref={videoRef} className="w-full h-full object-contain" autoPlay playsInline muted={isHost} />

      {/* CONTROLS */}
      {(isStreaming || (viewerHasJoined && room.is_playing)) && (
        <div className="absolute bottom-4 right-4 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all z-40">
          {micAvailable && (
            <button onClick={toggleMic} className={`p-3 backdrop-blur-md rounded-xl transition-all ${isMicMuted ? 'bg-red-500/20 text-red-400' : 'bg-neon-cyan/20 text-neon-cyan'}`}>
              {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
          )}
          <button onClick={toggleFullscreen} className="p-3 bg-black/50 hover:bg-neon-cyan/20 text-white backdrop-blur-md rounded-xl">
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      )}

      {/* OVERLAYS */}
      {isHost && !isStreaming && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <button onClick={startScreenShare} className="px-6 py-3 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan rounded-xl font-bold">Share Screen & Start Stream</button>
        </div>
      )}

      {!isHost && room.is_playing && !viewerHasJoined && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <button onClick={handleViewerJoin} className="px-8 py-4 bg-neon-cyan text-cinema-black rounded-xl font-black text-lg">TUNE IN LIVE</button>
        </div>
      )}
    </div>
  );
}
