import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

const NeuralNetworkBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const animationFrameId = useRef<number | null>(null);

  const numNodes = 100;
  const nodeSpeed = 0.1;
  const planeSize = 8; // Size of the plane (e.g., length of the triangle)
  const nodeColor = 'rgba(150, 150, 150, 0.8)'; // Color for the planes

  const initNodes = useCallback((width: number, height: number) => {
    nodesRef.current = Array.from({ length: numNodes }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * nodeSpeed,
      vy: (Math.random() - 0.5) * nodeSpeed,
      radius: planeSize, // Using planeSize as radius for consistency
    }));
    // Initialize mouse position to center if not already set
    if (mousePos === null) {
      setMousePos({ x: width / 2, y: height / 2 });
    }
  }, [numNodes, nodeSpeed, planeSize, mousePos]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = nodeColor;

    // Update and draw nodes (planes)
    nodesRef.current.forEach(node => {
      node.x += node.vx;
      node.y += node.vy;

      // Bounce off walls
      if (node.x < 0 || node.x > width) node.vx *= -1;
      if (node.y < 0 || node.y > height) node.vy *= -1;

      // Calculate angle to mouse position
      let angle = 0;
      if (mousePos) {
        angle = Math.atan2(mousePos.y - node.y, mousePos.x - node.x);
      }

      ctx.save(); // Save the current canvas state
      ctx.translate(node.x, node.y); // Move origin to node's position
      ctx.rotate(angle); // Rotate the canvas

      // Draw a simple triangle representing a plane, pointing right by default
      ctx.beginPath();
      ctx.moveTo(node.radius, 0); // Nose
      ctx.lineTo(-node.radius * 0.6, -node.radius * 0.6); // Left wing
      ctx.lineTo(-node.radius * 0.4, 0); // Tail
      ctx.lineTo(-node.radius * 0.6, node.radius * 0.6); // Right wing
      ctx.closePath();
      ctx.fill();

      ctx.restore(); // Restore the canvas state
    });

    animationFrameId.current = requestAnimationFrame(draw);
  }, [numNodes, nodeColor, mousePos]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initNodes(canvas.width, canvas.height); // Re-initialize nodes on resize
    };

    const handleMouseMove = (event: MouseEvent) => {
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    resizeCanvas(); // Initial resize and node initialization

    animationFrameId.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [draw, initNodes]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[-1] bg-gray-100 dark:bg-gray-900" // Ensure it's behind content
    />
  );
};

export default NeuralNetworkBackground;