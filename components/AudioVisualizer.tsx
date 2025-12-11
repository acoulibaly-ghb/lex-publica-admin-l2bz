
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  level: number; // 0 to 1
  isActive: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ level, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let currentLevel = 0;

    const draw = () => {
      if (!isActive) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      
      // Smooth interpolation
      currentLevel += (level - currentLevel) * 0.2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.2)'; // Blue-500 equivalent with opacity
      
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const maxRadius = Math.min(centerX, centerY) * 0.9;
      
      // Draw pulsating circle
      const radius = 20 + (currentLevel * (maxRadius - 20));
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();

      // Inner solid circle
      ctx.fillStyle = 'rgba(37, 99, 235, 0.8)'; // Blue-600
      ctx.beginPath();
      ctx.arc(centerX, centerY, 15 + (currentLevel * 10), 0, 2 * Math.PI);
      ctx.fill();

      animationId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [level, isActive]);

  return (
    <canvas 
      ref={canvasRef} 
      width={200} 
      height={200} 
      className="w-40 h-40 rounded-full bg-slate-100 dark:bg-slate-800 shadow-inner transition-colors"
    />
  );
};
