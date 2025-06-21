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
  const planeImageRef = useRef<HTMLImageElement | null>(null); // Ref to store the loaded SVG image

  const planeSize = 12; // Base size for the plane symbol (will be scaled to 2x this)
  const planeSpacing = 40; // Pixels between the center of each plane in the grid (reduced for more density)
  const nodeColor = 'rgba(76, 175, 80, 0.8)'; // Vibrant green for visibility

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

    // Set the fill style for the SVG (currentColor in SVG will pick this up)
    ctx.fillStyle = nodeColor;

    // Draw nodes (planes)
    nodesRef.current.forEach(node => {
      // Calculate angle from node to mouse position
      let angle = 0;
      if (mousePos) {
        // Math.atan2 gives angle relative to positive x-axis.
        // The SVG's "top" is initially pointing along the negative Y-axis.
        // So, we add Math.PI / 2 to align its "top" with the calculated angle.
        angle = Math.atan2(mousePos.y - node.y, mousePos.x - node.x) + Math.PI / 2;
      }

      ctx.save(); // Save the current canvas state
      ctx.translate(node.x, node.y); // Move origin to node's position
      ctx.rotate(angle); // Rotate the canvas

      // Draw the SVG image
      // The SVG is 24x24. We want to draw it centered at (0,0) after translation.
      // So, the top-left corner should be at (-width/2, -height/2).
      // The size will be 2 * node.radius.
      if (planeImageRef.current) {
        const drawSize = node.radius * 2; // Scale the 24x24 SVG to 2 * planeSize
        ctx.drawImage(planeImageRef.current, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      }

      ctx.restore(); // Restore the canvas state
    });

    animationFrameId.current = requestAnimationFrame(draw);
  }, [nodeColor, mousePos, planeSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Load the SVG image from the public folder
    const img = new Image();
    img.src = "/images/plane.svg"; // Correct path to the SVG file
    img.onload = () => {
      planeImageRef.current = img;
      // Once image is loaded, re-draw to ensure it appears
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
      animationFrameId.current = requestAnimationFrame(draw);
    };
    img.onerror = (err) => {
      console.error("Failed to load plane SVG image from /images/plane.svg:", err);
    };

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
      className="fixed inset-0 z-[-1]" // Removed opacity-30
      style={{ backgroundColor: 'var(--background)' }} // Use CSS variable for background
    />
  );
};

export default NeuralNetworkBackground;