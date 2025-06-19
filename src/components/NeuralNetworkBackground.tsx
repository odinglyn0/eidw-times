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
  // Removed mousePos state
  const nodesRef = useRef<Node[]>([]);
  const animationFrameId = useRef<number | null>(null);

  const numNodes = 100;
  const nodeSpeed = 0.1;
  const nodeRadius = 1.5;
  const connectionDistance = 120; // Max distance for lines between nodes
  // Removed mouseConnectionDistance
  const lineColor = 'rgba(100, 100, 100, 0.3)'; // Light grey for lines
  const nodeColor = 'rgba(150, 150, 150, 0.8)'; // Slightly darker grey for nodes

  const initNodes = useCallback((width: number, height: number) => {
    nodesRef.current = Array.from({ length: numNodes }).map(() => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * nodeSpeed,
      vy: (Math.random() - 0.5) * nodeSpeed,
      radius: nodeRadius,
    }));
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = lineColor;
    ctx.fillStyle = nodeColor;

    // Update and draw nodes
    nodesRef.current.forEach(node => {
      node.x += node.vx;
      node.y += node.vy;

      // Bounce off walls
      if (node.x < 0 || node.x > width) node.vx *= -1;
      if (node.y < 0 || node.y > height) node.vy *= -1;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw connections between nodes
    for (let i = 0; i < numNodes; i++) {
      for (let j = i + 1; j < numNodes; j++) {
        const node1 = nodesRef.current[i];
        const node2 = nodesRef.current[j];
        const dist = Math.sqrt(
          Math.pow(node1.x - node2.x, 2) + Math.pow(node1.y - node2.y, 2)
        );

        if (dist < connectionDistance) {
          ctx.beginPath();
          ctx.moveTo(node1.x, node1.y);
          ctx.lineTo(node2.x, node2.y);
          ctx.lineWidth = (1 - dist / connectionDistance) * 1.5; // Thicker lines for closer nodes
          ctx.stroke();
        }
      }
    }

    // Removed logic for drawing connections from nodes to mouse

    animationFrameId.current = requestAnimationFrame(draw);
  }, [numNodes, connectionDistance, lineColor, nodeColor]); // Removed mousePos from dependencies

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initNodes(canvas.width, canvas.height); // Re-initialize nodes on resize
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas(); // Initial resize

    // Removed handleMouseMove and mousemove event listener

    animationFrameId.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      // Removed mousemove event listener cleanup
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