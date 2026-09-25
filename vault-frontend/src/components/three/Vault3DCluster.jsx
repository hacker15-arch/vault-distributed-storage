import React, { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line, Float } from '@react-three/drei';
import * as THREE from 'three';
import Vault2DCluster from './Vault2DCluster';

// Central Coordinator Mesh Component
function CoordinatorNode() {
  const meshRef = useRef();

  useFrame((state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.5;
      meshRef.current.rotation.x += delta * 0.2;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef} position={[0, 1.2, 0]}>
        <octahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial
          color="#06b6d4"
          emissive="#0891b2"
          emissiveIntensity={0.8}
          wireframe
        />
      </mesh>
      {/* Inner glowing core */}
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={1} />
      </mesh>
    </Float>
  );
}

// Storage Node Mesh Component
function StorageNode3D({ position, node, isSelected, onClick }) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef();

  const isOnline = node.is_online !== false;
  const color = !isOnline ? '#f43f5e' : isSelected ? '#38bdf8' : '#10b981';
  const emissive = !isOnline ? '#e11d48' : isSelected ? '#0284c7' : '#059669';

  useFrame((state) => {
    if (meshRef.current && isOnline) {
      const time = state.clock.getElapsedTime();
      meshRef.current.position.y = position[1] + Math.sin(time * 2 + position[0]) * 0.1;
    }
  });

  const usedPct = Math.round(
    ((node.total_space_bytes - node.free_space_bytes) / (node.total_space_bytes || 1)) * 100
  );

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={onClick}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
      >
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial
          color={color}
          emissive={emissive}
          emissiveIntensity={hovered || isSelected ? 1.2 : 0.6}
          roughness={0.2}
          metalness={0.8}
        />
      </mesh>

      {/* Outer Halo ring when selected or hovered */}
      {(hovered || isSelected) && (
        <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6, 0.7, 32]} />
          <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.8} />
        </mesh>
      )}

      {/* HTML Hover Tooltip */}
      {(hovered || isSelected) && (
        <Html distanceFactor={12} position={[0, 0.9, 0]} center>
          <div className="glass-panel p-3 rounded-xl border border-cyan-500/50 shadow-2xl text-xs w-40 pointer-events-none z-50">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-1 mb-1">
              <span className="font-bold text-cyan-300 uppercase">{node.node_name}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isOnline ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'}`}>
                {isOnline ? 'HEALTHY' : 'OFFLINE'}
              </span>
            </div>
            <div className="space-y-0.5 text-slate-300 text-[11px] font-mono">
              <p>Storage: <span className="text-cyan-400 font-semibold">{usedPct}%</span></p>
              <p>Objects: <span className="text-slate-100">{node.object_count || 0}</span></p>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

// Particle Stream traveling between Coordinator and Storage Node
function DataParticleStream({ startPos, endPos, isOnline }) {
  const particleRef = useRef();

  useFrame((state) => {
    if (particleRef.current && isOnline) {
      const time = (state.clock.getElapsedTime() * 0.8) % 1;
      particleRef.current.position.lerpVectors(
        new THREE.Vector3(...startPos),
        new THREE.Vector3(...endPos),
        time
      );
    }
  });

  if (!isOnline) return null;

  return (
    <mesh ref={particleRef}>
      <sphereGeometry args={[0.08, 16, 16]} />
      <meshBasicMaterial color="#38bdf8" />
    </mesh>
  );
}

// Main 3D Canvas Scene
export default function Vault3DCluster({ nodes = [], selectedNode, onSelectNode }) {
  const [hasWebGLError, setHasWebGLError] = useState(false);

  const defaultNodes = [
    { node_name: 'node1', is_online: true, object_count: 4281, total_space_bytes: 1000000, free_space_bytes: 380000 },
    { node_name: 'node2', is_online: true, object_count: 3950, total_space_bytes: 1000000, free_space_bytes: 420000 },
    { node_name: 'node3', is_online: true, object_count: 4120, total_space_bytes: 1000000, free_space_bytes: 350000 },
    { node_name: 'node4', is_online: true, object_count: 4010, total_space_bytes: 1000000, free_space_bytes: 400000 },
    { node_name: 'node5', is_online: true, object_count: 4300, total_space_bytes: 1000000, free_space_bytes: 310000 },
  ];

  const displayNodes = nodes.length > 0 ? nodes : defaultNodes;
  const coordinatorPos = [0, 1.2, 0];
  const radius = 3.8;

  const nodePositions = displayNodes.map((_, idx) => {
    const angle = (idx / displayNodes.length) * Math.PI * 2;
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
  });

  if (hasWebGLError) {
    return <Vault2DCluster nodes={nodes} selectedNode={selectedNode} onSelectNode={onSelectNode} />;
  }

  return (
    <div className="relative w-full h-[420px] glass-panel rounded-2xl overflow-hidden border border-slate-800/80">
      <div className="absolute top-4 left-4 z-10 flex items-center space-x-2 bg-slate-950/80 px-3 py-1.5 rounded-full border border-slate-800">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
        <span className="text-xs font-semibold text-slate-200">Interactive 3D Cluster Topology</span>
      </div>

      <div className="absolute bottom-4 right-4 z-10 text-[10px] text-slate-500 font-mono bg-slate-950/80 px-2.5 py-1 rounded border border-slate-800">
        Rotate: Left Drag | Pan: Right Drag | Zoom: Scroll
      </div>

      <Canvas
        camera={{ position: [0, 5, 8], fov: 50 }}
        onCreated={({ gl }) => {
          if (!gl) setHasWebGLError(true);
        }}
        onError={() => setHasWebGLError(true)}
      >
        <ambientLight intensity={0.4} />
        <pointLight position={[10, 10, 10]} intensity={1.2} />
        <directionalLight position={[-5, 5, -5]} intensity={0.8} />

        {/* Central Vault Coordinator */}
        <CoordinatorNode />

        {/* Storage Nodes & Connections */}
        {displayNodes.map((node, idx) => {
          const pos = nodePositions[idx];
          const isOnline = node.is_online !== false;
          return (
            <React.Fragment key={node.node_name}>
              {/* Connection Line */}
              <Line
                points={[coordinatorPos, pos]}
                color={isOnline ? '#0891b2' : '#be123c'}
                lineWidth={1.5}
                dashed
                dashSize={0.2}
                gapSize={0.1}
              />

              {/* Data Transfer Particle Stream */}
              <DataParticleStream startPos={coordinatorPos} endPos={pos} isOnline={isOnline} />

              {/* 3D Storage Node Mesh */}
              <StorageNode3D
                position={pos}
                node={node}
                isSelected={selectedNode === node.node_name}
                onClick={() => onSelectNode && onSelectNode(node.node_name)}
              />
            </React.Fragment>
          );
        })}

        <OrbitControls enableZoom={true} autoRotate={true} autoRotateSpeed={0.5} maxPolarAngle={Math.PI / 2} />
      </Canvas>
    </div>
  );
}
