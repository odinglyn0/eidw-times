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
  const planeImageRef = useRef<HTMLImageElement | null>(null);

  const planeSize = 12;
  const planeSpacing = 40;
  const nodeColor = 'rgba(76, 175, 80, 0.8)';

  const initNodes = useCallback((width: number, height: number) => {
    nodesRef.current = [];
    const numCols = Math.floor(width / planeSpacing);
    const numRows = Math.floor(height / planeSpacing);

    const offsetX = (width - numCols * planeSpacing) / 2 + planeSpacing / 2;
    const offsetY = (height - numRows * planeSpacing) / 2 + planeSpacing / 2;

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        nodesRef.current.push({
          x: col * planeSpacing + offsetX,
          y: row * planeSpacing + offsetY,
          vx: 0,
          vy: 0,
          radius: planeSize,
        });
      }
    }
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

    const computedStyle = window.getComputedStyle(canvas);
    const bgColor = computedStyle.backgroundColor;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = nodeColor;

    nodesRef.current.forEach(node => {
      let angle = 0;
      if (mousePos) {
        angle = Math.atan2(mousePos.y - node.y, mousePos.x - node.x) + Math.PI / 2;
      }

      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.rotate(angle);

      if (planeImageRef.current) {
        const drawSize = node.radius * 2;
        ctx.drawImage(planeImageRef.current, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
      }

      ctx.restore();
    });

    animationFrameId.current = requestAnimationFrame(draw);
  }, [nodeColor, mousePos, planeSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!planeImageRef.current) {
      const img = new Image();
      img.src = "/images/plane.svg";
      img.onload = () => {
        planeImageRef.current = img;
      };
      img.onerror = (err) => {
        console.error("Failed to load plane SVG image from /images/plane.svg:", err);
      };
    }

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initNodes(canvas.width, canvas.height);
    };

    const handleMouseMove = (event: MouseEvent) => {
      setMousePos({ x: event.clientX, y: event.clientY });
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', handleMouseMove);
    resizeCanvas();

    if (animationFrameId.current === null) {
      animationFrameId.current = requestAnimationFrame(draw);
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
        animationFrameId.current = null;
      }
    };
  }, [draw, initNodes]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[-1] opacity-30"
      style={{ backgroundColor: 'var(--background)' }}
    />
  );
};

export default NeuralNetworkBackground;
