import React from 'react';
import { Shield, HardDrive, Wifi, Activity } from 'lucide-react';

export default function Vault2DCluster({ nodes = [], selectedNode, onSelectNode }) {
  const nodePositions = [
    { x: 150, y: 80 },
    { x: 350, y: 80 },
    { x: 450, y: 250 },
    { x: 250, y: 350 },
    { x: 50, y: 250 },
  ];

  const defaultNodes = [
    { node_name: 'node1', is_online: true, object_count: 4281, total_space_bytes: 1000000, free_space_bytes: 380000 },
    { node_name: 'node2', is_online: true, object_count: 3950, total_space_bytes: 1000000, free_space_bytes: 420000 },
    { node_name: 'node3', is_online: true, object_count: 4120, total_space_bytes: 1000000, free_space_bytes: 350000 },
    { node_name: 'node4', is_online: true, object_count: 4010, total_space_bytes: 1000000, free_space_bytes: 400000 },
    { node_name: 'node5', is_online: true, object_count: 4300, total_space_bytes: 1000000, free_space_bytes: 310000 },
  ];

  const displayNodes = nodes.length > 0 ? nodes : defaultNodes;
  const coordinatorPos = { x: 250, y: 200 };

  return (
    <div className="relative w-full h-80 glass-panel rounded-2xl p-4 overflow-hidden border border-slate-800/80 flex flex-col justify-between">
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center space-x-2">
          <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
          <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Cluster Topology (2D Topology View)
          </span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
          5 Storage Nodes
        </span>
      </div>

      <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 500 400">
        {/* Connection Lines from Vault Coordinator to Nodes */}
        {displayNodes.map((n, idx) => {
          const pos = nodePositions[idx % nodePositions.length];
          const isOnline = n.is_online !== false;
          return (
            <g key={n.node_name}>
              <line
                x1={coordinatorPos.x}
                y1={coordinatorPos.y}
                x2={pos.x}
                y2={pos.y}
                stroke={isOnline ? 'rgba(6, 182, 212, 0.4)' : 'rgba(244, 63, 94, 0.3)'}
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              {/* Animated particle pulse on line */}
              {isOnline && (
                <circle r="4" fill="#38bdf8">
                  <animateMotion
                    path={`M${coordinatorPos.x},${coordinatorPos.y} L${pos.x},${pos.y}`}
                    dur={`${2 + (idx % 3)}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              )}
            </g>
          );
        })}
      </svg>

      {/* Interactive Node Badges */}
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-4 py-8">
        {/* Central Coordinator */}
        <div className="flex flex-col items-center p-3 rounded-2xl bg-gradient-to-tr from-cyan-950 to-emerald-950 border border-cyan-500/40 glow-cyan shadow-xl">
          <Shield className="w-8 h-8 text-cyan-400 fill-cyan-950" />
          <span className="text-xs font-bold text-cyan-200 mt-1">VAULT CENTRAL</span>
          <span className="text-[10px] text-cyan-400/80 font-mono">Coordinator</span>
        </div>

        {/* Nodes */}
        <div className="w-full flex items-center justify-around mt-4">
          {displayNodes.map((node, idx) => {
            const isOnline = node.is_online !== false;
            const isSelected = selectedNode === node.node_name;
            const usedPct = Math.round(
              ((node.total_space_bytes - node.free_space_bytes) / (node.total_space_bytes || 1)) * 100
            );

            return (
              <button
                key={node.node_name}
                onClick={() => onSelectNode && onSelectNode(node.node_name)}
                className={`flex flex-col items-center p-2.5 rounded-xl border transition-all ${
                  isSelected
                    ? 'bg-cyan-950/80 border-cyan-400 glow-cyan scale-105'
                    : isOnline
                    ? 'bg-slate-900/60 border-slate-800 hover:border-cyan-500/50 hover:scale-102'
                    : 'bg-rose-950/40 border-rose-800/60 opacity-75'
                }`}
              >
                <div className="flex items-center space-x-1.5">
                  <HardDrive className={`w-4 h-4 ${isOnline ? 'text-emerald-400' : 'text-rose-400'}`} />
                  <span className="text-xs font-semibold text-slate-200 uppercase">{node.node_name}</span>
                </div>
                <div className="text-[10px] text-slate-400 font-mono mt-1">
                  {isOnline ? `${usedPct}% used` : 'OFFLINE'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[10px] text-slate-500 text-center z-10 font-mono">
        Active Replication Factor: N=3 (W=2, R=2 Quorum)
      </div>
    </div>
  );
}
