import React from 'react';
import { motion } from 'framer-motion';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ size = 'md' }: LogoProps) {
  // Configures scaling for different parts of the app
  const dimensions = {
    sm: { icon: 'w-8 h-8', text: 'text-2xl', svg: 'w-4 h-4' },
    md: { icon: 'w-10 h-10', text: 'text-3xl', svg: 'w-5 h-5' },
    lg: { icon: 'w-14 h-14', text: 'text-5xl', svg: 'w-7 h-7' }
  };

  return (
    <motion.div 
      className="flex items-center gap-3 justify-center"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Glowing Glassmorphism Icon Box */}
      <div className={`relative flex items-center justify-center ${dimensions[size].icon} rounded-xl bg-white/5 border border-white/10 backdrop-blur-lg shadow-[0_0_20px_rgba(0,242,254,0.2)] overflow-hidden`}>
        {/* Dynamic internal glow */}
        <div className="absolute inset-0 bg-gradient-to-tr from-neon-cyan/20 to-transparent opacity-50"></div>
        
        {/* Custom SVG combining a Play button with an 'S' curve */}
        <svg 
          viewBox="0 0 32 32" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg" 
          className={`${dimensions[size].svg} z-10`}
        >
          <path d="M13 10L23 16L13 22V10Z" fill="url(#logo-grad)" />
          <path d="M9 22C9 16 21 16 21 10" stroke="url(#logo-grad)" strokeWidth="3" strokeLinecap="round" />
          <defs>
            <linearGradient id="logo-grad" x1="9" y1="10" x2="23" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00f2fe" />
              <stop offset="1" stopColor="#4facfe" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      
      {/* Stylized Typography */}
      <h1 className={`font-black tracking-tighter ${dimensions[size].text}`}>
        <span className="bg-gradient-to-r from-neon-cyan to-[#4facfe] bg-clip-text text-transparent drop-shadow-[0_0_10px_rgba(0,242,254,0.3)]">
          Stream
        </span>
        <span className="text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]">
          Yo
        </span>
      </h1>
    </motion.div>
  );
}