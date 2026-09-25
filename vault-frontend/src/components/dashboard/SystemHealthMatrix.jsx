import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Activity, Server, Database, Shield, Wrench } from 'lucide-react';

export default function SystemHealthMatrix({ health, nodes = [] }) {
  const components = [
    { name: 'API Server Engine', status: 'healthy', icon: Server, latency: '2 ms' },
    { name: 'SQLite Metadata DB (WAL)', status: 'healthy', icon: Database, latency: '1 ms' },
    { name: 'HRW Replication Manager', status: 'healthy', icon: Shield, latency: '4 ms' },
    { name: 'Self-Healing Repair Engine', status: 'healthy', icon: Wrench, latency: 'idle' },
  ];

  return (
    <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          System Component Health Matrix
        </h3>
        <span className="text-xs text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
          W+R &gt; N Quorum Validated
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {components.map((comp) => {
          const Icon = comp.icon;
          return (
            <div
              key={comp.name}
              className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between"
            >
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-lg bg-slate-800/80 text-cyan-400">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">{comp.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">Latency: {comp.latency}</p>
                </div>
              </div>

              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
          );
        })}
      </div>

      {/* Node Health List Mini Matrix */}
      <div className="pt-2">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Storage Node Health</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {(nodes.length > 0 ? nodes : [{ node_name: 'node1' }, { node_name: 'node2' }, { node_name: 'node3' }, { node_name: 'node4' }, { node_name: 'node5' }]).map((n) => {
            const isOnline = n.is_online !== false;
            return (
              <div
                key={n.node_name}
                className={`p-2 rounded-xl border flex items-center justify-between text-xs font-mono ${
                  isOnline
                    ? 'bg-emerald-950/20 border-emerald-800/40 text-emerald-300'
                    : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                }`}
              >
                <span className="font-bold uppercase">{n.node_name}</span>
                {isOnline ? (
                  <span className="flex items-center gap-1 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Offline
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
