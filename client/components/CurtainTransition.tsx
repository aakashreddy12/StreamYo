import React, { useEffect } from 'react';
import { motion } from 'framer-motion';

interface CurtainTransitionProps {
  onComplete: () => void;
}

export default function CurtainTransition({ onComplete }: CurtainTransitionProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 1300);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Left Curtain */}
      <motion.div
        initial={{ x: 0 }}
        animate={{ x: '-110%' }}
        transition={{
          duration: 1.2,
          ease: [0.4, 0, 0.2, 1],
          delay: 0.1,
        }}
        className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-cinema-black via-cinema-dark to-transparent"
      >
        {/* Curtain texture */}
        <div className="absolute inset-0 opacity-40 bg-gradient-to-b from-transparent via-white/5 to-transparent" />
      </motion.div>

      {/* Right Curtain */}
      <motion.div
        initial={{ x: 0 }}
        animate={{ x: '110%' }}
        transition={{
          duration: 1.2,
          ease: [0.4, 0, 0.2, 1],
          delay: 0.1,
        }}
        className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-cinema-black via-cinema-dark to-transparent"
      >
        {/* Curtain texture */}
        <div className="absolute inset-0 opacity-40 bg-gradient-to-b from-transparent via-white/5 to-transparent" />
      </motion.div>

      {/* Center light glow */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{
          duration: 1.2,
          ease: 'easeInOut',
          delay: 0.1,
        }}
        className="absolute inset-0 bg-gradient-to-b from-neon-cyan/10 via-transparent to-transparent"
      />
    </div>
  );
}
