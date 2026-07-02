import React, { useEffect, useRef, useState } from 'react';
import Peer, { MediaConnection } from 'peerjs';
import { supabase } from '@/lib/supabase';
import { PlayCircle, AlertCircle, Maximize, Minimize, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function VideoPlayer({ room, userId }: { room: Room, userId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null); // Screen Stream
  const voiceStreamRef = useRef<MediaStream | null>(null); // Mic Stream
  const peerRef = useRef<Peer | null>(null);
  const signalingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isInitialized = useRef(false);

  const [isStreaming, setIsStreaming] = useState(false);
  const [viewerHasJoined, setViewerHasJoined] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(true);
  const [activeVoiceStreams, setActiveVoiceStreams] = useState<MediaStream[]>([]);

  const isHost = room.host_id === userId;
  const myPeerId = isHost ? `host-${room.id}` : `viewer-${userId}-${Math.random().toString(36).substr(2, 5)}`;

  // 1. HARDWARE INIT: Capture Mic
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(stream => {
        stream.getAudioTracks()[0].enabled = false; // Start muted
        voiceStreamRef.current = stream;
      })
      .catch(e => console.error("Mic Access Denied:", e));
  }, []);

  // 2. SIGNALING & PEERJS
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    const peer = new Peer(myPeerId, { debug: 2 });
    peerRef.current = peer;

    // Use Supabase to signal peers
    const channel = supabase.channel(`sig-${room.id}`);
    signalingChannelRef.current = channel;

    // Listen for PeerJS calls
    peer.on('call', (call: MediaConnection) => {
      if (call.metadata?.type === 'voice') {
        // Answer voice call with mic stream
        call.answer(voiceStreamRef.current || undefined);
        call.on('stream', s => setActiveVoiceStreams(prev => [...prev, s]));
      } else if (call.metadata?.type === 'screen') {
        // Answer screen call with an empty stream (viewer side)
        call.answer();
        call.on('stream', (s) => {
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play().catch(console.error);
          }
        });
      }
    });

    // Signaling to initiate calls
    channel.on('broadcast', { event: 'new-viewer' }, (payload) => {
      if (isHost && streamRef.current && peerRef.current) {
        // Call for screen
        peerRef.current.call(payload.payload.id, streamRef.current, { metadata: { type: 'screen' } });
        // Call for voice
        peerRef.current.call(payload.payload.id, voiceStreamRef.current || undefined, { metadata: { type: 'voice' } });
      }
    }).subscribe();

    return () => { peer.destroy(); channel.unsubscribe(); };
  }, [isHost, myPeerId, room.id]);

  // 3. HOST: START SCREEN SHARE (Pure Screen/Tab Audio)
  const startScreenShare = async () => {
    if (!isHost) return;
    try {
      // Get screen + tab audio only
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: { autoGainControl: false, echoCancellation: false, noiseSuppression: false }
      });
      streamRef.current = s;
      if (videoRef.current) videoRef.current.srcObject = s;
      setIsStreaming(true);
      await supabase.from('rooms').update({ is_playing: true }).eq('id', room.id);
    } catch (e) { console.error(e); }
  };

  // 4. VIEWER: JOIN (Initiate 2 calls: one for screen, one for voice)
  const handleJoin = () => {
    setViewerHasJoined(true);
    // Request a call from host via signaling
    signalingChannelRef.current?.send({ 
      type: 'broadcast', event: 'new-viewer', payload: { id: myPeerId } 
    });
    // Call host back for voice
    peerRef.current?.call(`host-${room.id}`, voiceStreamRef.current || undefined, { metadata: { type: 'voice' } });
  };

  return (
    <div className="relative w-full h-full bg-black rounded-xl overflow-hidden flex items-center justify-center">
      {/* Voice streams */}
      {activeVoiceStreams.map((s, i) => <audio key={i} autoPlay ref={el => el && (el.srcObject = s)} />)}
      
      {/* Video */}
      <video ref={videoRef} autoPlay playsInline className="w-full h-full" muted={isHost} />

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex gap-2 z-30">
        <button onClick={() => {
          if(voiceStreamRef.current) {
            voiceStreamRef.current.getAudioTracks()[0].enabled = !voiceStreamRef.current.getAudioTracks()[0].enabled;
            setIsMicMuted(!voiceStreamRef.current.getAudioTracks()[0].enabled);
          }
        }} className="p-3 bg-white/20 rounded-full">{isMicMuted ? <MicOff/> : <Mic/>}</button>
      </div>

      {/* Overlay */}
      {!isHost && !viewerHasJoined && (
        <button onClick={handleJoin} className="absolute z-40 bg-neon-cyan px-8 py-4 rounded-xl font-bold">TUNE IN</button>
      )}
      {isHost && !isStreaming && (
        <button onClick={startScreenShare} className="absolute z-40 bg-neon-cyan px-8 py-4 rounded-xl font-bold">START STREAM</button>
      )}
    </div>
  );
}
