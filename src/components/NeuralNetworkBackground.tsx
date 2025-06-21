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

  // useCallback for initNodes, now truly stable as it doesn't depend on mousePos
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
  }, [planeSize, planeSpacing]);

  // useCallback for draw, still depends on mousePos, so it will be re-created
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    // Get the computed background color from the canvas element's style
    const computedStyle = window.getComputedStyle(canvas);
    const bgColor = computedStyle.backgroundColor;

    // Draw the background color directly on the canvas
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Set the fill style for the SVG (currentColor in SVG will pick this up)
    ctx.fillStyle = nodeColor;

    // Draw nodes (planes)
    nodesRef.current.forEach(node => {
      // Calculate angle from node to mouse position
      let angle = 0;
      if (mousePos) {
        angle = Math.atan2(mousePos.y - node.y, mousePos.x - node.x) + Math.PI / 2;
      }

      ctx.save(); // Save the current canvas state
      ctx.translate(node.x, node.y); // Move origin to node's position
      ctx.rotate(angle); // Rotate the canvas

      // Draw the SVG image
      if (planeImageRef.current) {
        const drawSize = node.radius * 2; // Scale the 24x24 SVG to 2 * planeSize
        ctx.drawImage(planeImageRef.current, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      }

      ctx.restore(); // Restore the canvas state
    });
  }, [nodeColor, mousePos, planeSize]);

  // Effect 1: Load the SVG image once when the component mounts
  useEffect(() => {
    const img = new Image();
    img.src = "/images/plane.svg"; // Correct path to the SVG file
    img.onload = () => {
      planeImageRef.current = img;
    };
    img.onerror = (err) => {
      console.error("Failed to load plane SVG image from /images/plane.svg:", err);
    };
  }, []); // Empty dependency array ensures this runs only once

  // Effect 2: Setup canvas, resize, and mousemove listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initNodes(canvas.width, canvas.height); // Re-initialize nodes on resize
      // Set initial mouse position to center of canvas if not already set
      setMousePos(prevPos => prevPos === null ? { x: canvas.width / 2, y: canvas.height / 2 } : prevPos);
    };

    const handleMouseMove = (event: MouseEvent) => {
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    resizeCanvas(); // Initial resize and node initialization

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [initNodes]); // initNodes is a stable useCallback, so this effect runs once

  // Effect 3: Manage the animation frame loop
  useEffect(() => {
    const animate = () => {
      draw(); // Call the latest `draw` function
      animationFrameId.current = requestAnimationFrame(animate);
    };

    animationFrameId.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [draw]); // `draw` is a dependency because it changes when `mousePos` changes.
              // This ensures the animation loop always uses the latest `draw` function.

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[-1] opacity-30"
      style={{ backgroundColor: 'var(--background)' }} // Still use CSS variable for the element's background, which is read by JS
    />
  );
};

export default NeuralNetworkBackground;