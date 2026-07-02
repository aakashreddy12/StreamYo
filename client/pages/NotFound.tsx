import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error(
      '404 Error: User attempted to access non-existent route:',
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-cinema-black via-cinema-dark to-cinema-black flex items-center justify-center overflow-hidden">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-neon-cyan/10 rounded-full blur-3xl"
          animate={{ x: [0, 50, 0], y: [0, -50, 0] }}
          transition={{ duration: 20, repeat: Infinity }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-neon-purple/10 rounded-full blur-3xl"
          animate={{ x: [0, -50, 0], y: [0, 50, 0] }}
          transition={{ duration: 25, repeat: Infinity }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center max-w-lg px-4"
      >
        <motion.div
          animate={{ scale: [1, 1.05, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="mb-8"
        >
          <h1 className="text-9xl font-black bg-gradient-to-r from-neon-cyan to-neon-purple bg-clip-text text-transparent">
            404
          </h1>
        </motion.div>

        <h2 className="text-3xl font-bold text-foreground mb-4">
          Lost in the Arena
        </h2>
        <p className="text-lg text-muted-foreground mb-8">
          The page you're looking for doesn't exist or has been removed from the
          streaming experience.
        </p>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => navigate('/dashboard')}
          className="btn-primary-cinema"
        >
          Back to Dashboard
        </motion.button>

        <p className="mt-8 text-sm text-muted-foreground">
          Path: <code className="font-mono text-neon-cyan/50">{location.pathname}</code>
        </p>
      </motion.div>
    </div>
  );
};

export default NotFound;
