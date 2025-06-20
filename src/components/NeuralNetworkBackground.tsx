import React, { useRef, useEffect, useState, useCallback } from 'react';

interface Node {
  x: number;
  y: number;
  vx: number; // Will be 0 for static planes
  vy: number; // Will be 0 for static planes
  radius: number; // Used for scaling the plane symbol
}

const NeuralNetworkBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const animationFrameId = useRef<number | null>(null);

  const planeSize = 8; // Base size for the plane symbol
  const planeSpacing = 60; // Pixels between the center of each plane in the grid
  const nodeColor = 'rgba(150, 150, 150, 0.8)'; // Color for the planes

  const initNodes = useCallback((width: number, height: number) => {
    nodesRef.current = [];
    const numCols = Math.floor(width / planeSpacing);
    const numRows = Math.floor(height / planeSpacing);

    // Calculate offset to center the grid
    const offsetX = (width - numCols * planeSpacing) / 2 + planeSpacing / 2;
    const offsetY = (height - numRows * planeSpacing) / 2 + planeSpacing / 2;

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        nodesRef.current.push({
          x: col * planeSpacing + offsetX,
          y: row * planeSpacing + offsetY,
          vx: 0, // Planes are static, no velocity
          vy: 0, // Planes are static, no velocity
          radius: planeSize,
        });
      }
    }
    // Initialize mouse position to center if not already set
    if (mousePos === null) {
      setMousePos({ x: width / 2, y: height / 2 });
    }
  }, [planeSize, planeSpacing, mousePos]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = nodeColor;

    // Draw nodes (planes)
    nodesRef.current.forEach(node => {
      // Planes are static, no position update needed here
      // node.x += node.vx;
      // node.y += node.vy;

      // Calculate angle to mouse position
      let angle = 0;
      if (mousePos) {
        angle = Math.atan2(mousePos.y - node.y, mousePos.x - node.x);
      }

      ctx.save(); // Save the current canvas state
      ctx.translate(node.x, node.y); // Move origin to node's position
      ctx.rotate(angle); // Rotate the canvas

      // Draw a stylized plane shape (top-down view)
      ctx.beginPath();
      // Nose
      ctx.moveTo(node.radius * 1.5, 0);
      // Body to front wings
      ctx.lineTo(node.radius * 0.5, -node.radius * 0.2);
      // Left wing tip
      ctx.lineTo(node.radius * 0.2, -node.radius * 1.0);
      // Left wing inner
      ctx.lineTo(node.radius * 0.0, -node.radius * 0.2);
      // Body to rear wings
      ctx.lineTo(-node.radius * 0.8, -node.radius * 0.2);
      // Tail left
      ctx.lineTo(-node.radius * 1.2, -node.radius * 0.1);
      // Tail tip
      ctx.lineTo(-node.radius * 1.5, 0);
      // Tail right
      ctx.lineTo(-node.radius * 1.2, node.radius * 0.1);
      // Body to rear wings (right side)
      ctx.lineTo(-node.radius * 0.8, node.radius * 0.2);
      // Right wing inner
      ctx.lineTo(node.radius * 0.0, node.radius * 0.2);
      // Right wing tip
      ctx.lineTo(node.radius * 0.2, node.radius * 1.0);
      // Body to front wings (right side)
      ctx.lineTo(node.radius * 0.5, node.radius * 0.2);
      ctx.closePath();
      ctx.fill();

      ctx.restore(); // Restore the canvas state
    });

    animationFrameId.current = requestAnimationFrame(draw);
  }, [nodeColor, mousePos, planeSize, planeSpacing]); // Added planeSize and planeSpacing to dependencies

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