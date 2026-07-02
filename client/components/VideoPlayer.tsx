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
  const viewerHasJoinedRef = useRef(false);
  const isInitialized = useRef(false); 
  
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerHasJoined, setViewerHasJoined] = useState(false);
  const [peerError, setPeerError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [toastMessages, setToastMessages] = useState<ToastMessage[]>([]);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [activeVoiceStreams, setActiveVoiceStreams] = useState<MediaStream[]>([]);
  
  const isHost = room.host_id === userId;
  const [myPeerId] = useState(() => isHost ? `sye-host-${room.id}` : `sye-viewer-${userId}-${Math.floor(Math.random() * 1000)}`);

  // -------------- HARDWARE & INIT --------------
  useEffect(() => {
    if (isHost) supabase.from('rooms').update({ is_playing: false }).eq('id', room.id);
    
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        stream.getAudioTracks()[0].enabled = false; 
        voiceStreamRef.current = stream;
      })
      .catch(console.error);
  }, [isHost, room.id]);

  const toggleMic = () => {
    if (voiceStreamRef.current) {
      const audioTrack = voiceStreamRef.current.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMicMuted(!audioTrack.enabled);
    }
  };

  // -------------- MEDIA MERGING (THE FIX) --------------
  const startScreenShare = async () => {
    if (!isHost) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } },
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false } 
      });

      // Merge the microphone tracks into the screen stream
      if (voiceStreamRef.current) {
        voiceStreamRef.current.getAudioTracks().forEach(track => {
          screenStream.addTrack(track);
        });
      }

      streamRef.current = screenStream;
      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;
        videoRef.current.play();
      }
      setIsStreaming(true);

      await supabase.from('rooms').update({ is_playing: true }).eq('id', room.id);
      signalingChannelRef.current?.send({ type: 'broadcast', event: 'host-ready', payload: {} });

      screenStream.getVideoTracks()[0].onended = async () => {
        setIsStreaming(false);
        streamRef.current = null;
        await supabase.from('rooms').update({ is_playing: false }).eq('id', room.id);
      };
    } catch (err) { console.error(err); }
  };

  // -------------- PEERJS & SIGNALING --------------
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const channel = supabase.channel(`webrtc-signaling-${room.id}`);
    signalingChannelRef.current = channel;

    const peer = new Peer(myPeerId, { debug: 2 });
    peerRef.current = peer;

    channel.on('broadcast', { event: 'knock-for-screen' }, (payload) => {
      if (isHost && streamRef.current && peerRef.current) {
        // Send the combined screen+audio stream
        peerRef.current.call(payload.payload.peerId, streamRef.current, { metadata: { type: 'screen' } });
      }
    }).subscribe();

    peer.on('call', (call: MediaConnection) => {
      if (call.metadata?.type === 'screen' && !isHost) {
        call.answer(createSyntheticStream()); 
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

  // -------------- RENDER --------------
  return (
    <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden glassmorphism shadow-2xl relative border border-white/10 bg-black flex items-center justify-center group">
      <video ref={videoRef} className="w-full h-full object-contain" autoPlay playsInline muted={isHost} />
      
      {/* Mic Toggle */}
      {(isStreaming || (viewerHasJoined && room.is_playing)) && (
         <button onClick={toggleMic} className={`absolute bottom-4 right-4 z-40 p-3 rounded-xl ${isMicMuted ? 'bg-red-500/20 text-red-400' : 'bg-neon-cyan/20 text-neon-cyan'}`}>
            {isMicMuted ? <MicOff size={20} /> : <Mic size={20} />}
         </button>
      )}

      {/* Overlays (Host/Join) */}
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
