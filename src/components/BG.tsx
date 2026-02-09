'use client'

import { useEffect, useRef } from 'react'

export function WebGLBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0, prevX: 0, prevY: 0 })
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl = canvas.getContext('webgl')
    if (!gl) {
      console.error('WebGL not supported')
      return
    }

    const vertexShaderSource = `
      attribute vec2 a_position;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `

    const fragmentShaderSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;

      float noise(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      }

      float smoothNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        
        float a = noise(i);
        float b = noise(i + vec2(1.0, 0.0));
        float c = noise(i + vec2(0.0, 1.0));
        float d = noise(i + vec2(1.0, 1.0));
        
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        float frequency = 1.0;
        
        for(int i = 0; i < 6; i++) {
          value += amplitude * smoothNoise(p * frequency);
          frequency *= 2.0;
          amplitude *= 0.5;
        }
        return value;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        vec2 p = uv * 6.0;

        float t = u_time * 0.05;
        vec2 offset1 = vec2(cos(t * 0.3) * 2.0, sin(t * 0.4) * 2.0);
        vec2 offset2 = vec2(sin(t * 0.5) * 1.5, cos(t * 0.3) * 1.5);

        float height = fbm(p + offset1) * 0.5 + fbm(p * 1.5 + offset2) * 0.5;

        height += sin(u_time * 0.2 + p.x * 2.0) * 0.1;
        height += cos(u_time * 0.15 + p.y * 2.5) * 0.1;

        float contour = fract(height * 10.0);
        float lineWidth = 0.06;
        float line = smoothstep(lineWidth, 0.0, contour) + 
                     smoothstep(1.0 - lineWidth, 1.0, contour);

        line *= 0.8 + sin(u_time * 0.3 + height * 10.0) * 0.2;

        float alpha = line * 0.06;
        
        gl_FragColor = vec4(1.0, 1.0, 1.0, alpha);
      }
    `

    function compileShader(source: string, type: number) {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader))
        gl.deleteShader(shader)
        return null
      }
      return shader
    }

    const vertexShader = compileShader(vertexShaderSource, gl.VERTEX_SHADER)
    const fragmentShader = compileShader(fragmentShaderSource, gl.FRAGMENT_SHADER)

    if (!vertexShader || !fragmentShader) return

    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program))
      return
    }

    gl.useProgram(program)

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
         1,  1,
      ]),
      gl.STATIC_DRAW
    )

    const positionLocation = gl.getAttribLocation(program, 'a_position')
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    const resolutionLocation = gl.getUniformLocation(program, 'u_resolution')
    const mouseLocation = gl.getUniformLocation(program, 'u_mouse')
    const timeLocation = gl.getUniformLocation(program, 'u_time')
    const mouseVelocityLocation = gl.getUniformLocation(program, 'u_mouseVelocity')

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    let animationId: number
    const render = () => {
      timeRef.current += 0.016

      const velocityX = mouseRef.current.x - mouseRef.current.prevX
      const velocityY = mouseRef.current.y - mouseRef.current.prevY

      gl.uniform2f(resolutionLocation, canvas.width, canvas.height)
      gl.uniform1f(timeLocation, timeRef.current)

      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      animationId = requestAnimationFrame(render)
    }
    render()

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animationId)
      gl.deleteProgram(program)
      gl.deleteShader(vertexShader)
      gl.deleteShader(fragmentShader)
      gl.deleteBuffer(positionBuffer)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ width: '100vw', height: '100vh' }}
    />
  )
}