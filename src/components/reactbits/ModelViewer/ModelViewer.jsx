/* eslint-disable react/no-unknown-property */
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Environment, useGLTF } from '@react-three/drei';

// Peta preset -> berkas HDRI lokal di public/hdri/. Tambahkan entri baru di
// sini (dan unduh berkasnya) kalau butuh preset lain.
const ENVIRONMENT_FILES = {
  studio: '/hdri/studio_small_03_1k.hdr',
};
import * as THREE from 'three';
import './ModelViewer.css';

const degToRad = (degree) => (degree * Math.PI) / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReduced(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  return reduced;
};

const usePageVisible = () => {
  const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : !document.hidden));

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const handleVisibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return visible;
};

const ModelScene = ({
  url,
  scale = 1.65,
  rotation = [-16, -26, 0],
  position = [0, -0.1, 0],
  parallax,
  autoRotateSpeed = 0.34,
  enabled = true,
  hovered = false,
  onModelLoaded,
}) => {
  const groupRef = useRef(null);
  const normalizedRef = useRef(false);
  const baseRotationRef = useRef(rotation.map(degToRad));
  const basePositionRef = useRef(position);
  const { scene } = useGLTF(url);
  const model = useMemo(() => scene.clone(true), [scene]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group || normalizedRef.current) return;

    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const largestSide = Math.max(size.x, size.y, size.z) || 1;

    model.position.set(-center.x, -center.y, -center.z);
    model.scale.setScalar(scale / largestSide);
    model.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = false;
        object.receiveShadow = false;
        if (object.material) {
          object.material.envMapIntensity = 0.9;
          object.material.needsUpdate = true;
        }
      }
    });

    const [rotationX, rotationY, rotationZ] = rotation.map(degToRad);
    baseRotationRef.current = [rotationX, rotationY, rotationZ];
    basePositionRef.current = position;
    group.rotation.set(rotationX, rotationY, rotationZ);
    group.position.set(...position);
    normalizedRef.current = true;
    onModelLoaded?.();
  }, [model, onModelLoaded, position, rotation, scale]);

  useEffect(() => {
    if (!normalizedRef.current || !groupRef.current) return;
    const group = groupRef.current;
    const [rotationX, rotationY, rotationZ] = rotation.map(degToRad);
    baseRotationRef.current = [rotationX, rotationY, rotationZ];
    basePositionRef.current = position;
    group.rotation.set(rotationX, rotationY, rotationZ);
    group.position.set(...position);
  }, [position, rotation]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const group = groupRef.current;
    const [baseX, baseY, baseZ] = baseRotationRef.current;
    const [posX, posY, posZ] = basePositionRef.current;
    const motionScale = enabled ? 1 : 0;
    const targetX = baseX + (parallax.y * 0.16 * motionScale);
    const targetY = baseY + (parallax.x * 0.22 * motionScale);
    const targetZ = baseZ + (parallax.x * -0.035 * motionScale);
    const targetPosX = posX + (parallax.x * 0.035 * motionScale);
    const targetPosY = posY + (parallax.y * -0.025 * motionScale);
    const targetScale = hovered && enabled ? 1.045 : 1;
    const easing = Math.min(1, delta * 7);

    group.rotation.x += (targetX - group.rotation.x) * easing;
    group.rotation.y += (targetY - group.rotation.y) * easing;
    group.rotation.z += (targetZ - group.rotation.z) * easing;
    group.position.x += (targetPosX - group.position.x) * easing;
    group.position.y += (targetPosY - group.position.y) * easing;
    group.position.z += (posZ - group.position.z) * easing;
    group.scale.x += (targetScale - group.scale.x) * easing;
    group.scale.y += (targetScale - group.scale.y) * easing;
    group.scale.z += (targetScale - group.scale.z) * easing;

    if (enabled && autoRotateSpeed > 0) {
      group.rotation.y += autoRotateSpeed * delta * 0.08;
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={model} />
    </group>
  );
};

const ModelViewer = ({
  url,
  width = 300,
  height = 300,
  className = '',
  environmentPreset = 'studio',
  defaultZoom = 2.75,
  modelScale = 1.65,
  modelPosition = [0, -0.08, 0],
  modelRotation = [-16, -26, 0],
  autoRotateSpeed = 0.34,
  fadeIn = true,
  onModelLoaded,
}) => {
  const reducedMotion = useReducedMotion();
  const pageVisible = usePageVisible();
  const viewerRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });
  const shouldAnimate = pageVisible && !reducedMotion;

  useEffect(() => {
    if (url) useGLTF.preload(url);
  }, [url]);

  if (!url) return null;

  return (
    <div
      ref={viewerRef}
      className={`rb-model-viewer ${fadeIn ? 'rb-model-viewer--fade' : ''} ${className}`.trim()}
      style={{ width, height }}
      aria-hidden="true"
      onPointerEnter={() => setHovered(true)}
      onPointerMove={(event) => {
        if (!shouldAnimate || !viewerRef.current) return;
        const rect = viewerRef.current.getBoundingClientRect();
        const x = clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1);
        const y = clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1);
        setParallax({ x, y });
      }}
      onPointerLeave={() => {
        setHovered(false);
        setParallax({ x: 0, y: 0 });
      }}
    >
      <Canvas
        dpr={[1, 1.75]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        camera={{ fov: 34, position: [0, 0, defaultZoom], near: 0.01, far: 100 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[3.5, 4, 4.5]} intensity={1.35} />
        <directionalLight position={[-3, 2, 2]} intensity={0.55} />
        {/* HDRI di-self-host, bukan preset drei.
            `preset` membuat drei mengambil berkas .hdr dari CDN pihak ketiga
            saat runtime — gagal saat offline, menambah dependensi rantai pasok,
            dan memaksa CSP mengizinkan host luar untuk connect-src. */}
        {environmentPreset !== 'none' && (
          <Environment files={ENVIRONMENT_FILES[environmentPreset] ?? ENVIRONMENT_FILES.studio} background={false} />
        )}
        <Suspense fallback={null}>
          <ModelScene
            url={url}
            scale={modelScale}
            rotation={modelRotation}
            position={modelPosition}
            parallax={parallax}
            autoRotateSpeed={autoRotateSpeed}
            enabled={shouldAnimate}
            hovered={hovered}
            onModelLoaded={onModelLoaded}
          />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default ModelViewer;
