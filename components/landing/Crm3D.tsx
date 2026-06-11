"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bounds, Center, Environment, useGLTF } from "@react-three/drei";
import type { MotionValue } from "framer-motion";
import type { Group } from "three";

function Model({ progress }: { progress: MotionValue<number> }) {
  const { scene } = useGLTF("/landing/crm.glb");
  const group = useRef<Group>(null);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    // Slow idle spin plus a scroll-linked half turn through the section.
    g.rotation.y += delta * 0.15;
    g.rotation.x = -0.15 + progress.get() * 0.5;
  });

  return (
    <group ref={group}>
      <Center>
        <primitive object={scene} />
      </Center>
    </group>
  );
}

export default function Crm3D({ progress }: { progress: MotionValue<number> }) {
  return (
    <Canvas dpr={[1, 1.8]} camera={{ position: [0, 1.2, 5], fov: 42 }} gl={{ antialias: true }}>
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 6, 4]} intensity={1.4} />
      <directionalLight position={[-5, 2, -3]} intensity={0.5} color="#f5c777" />
      <Suspense fallback={null}>
        <Environment preset="city" />
        <Bounds fit clip observe margin={1.15}>
          <Model progress={progress} />
        </Bounds>
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload("/landing/crm.glb");
