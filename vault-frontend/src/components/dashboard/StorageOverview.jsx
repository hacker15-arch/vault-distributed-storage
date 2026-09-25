import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { Database, HardDrive, ShieldCheck, ArrowUpRight } from 'lucide-react';

export default function StorageOverview({ nodes = [] }) {
  // Compute aggregated storage statistics
  const totalCapacity = nodes.reduce((sum, n) => sum + (n.total_space_bytes || 0), 0) || 3 * 1024 * 1024 * 1024;
  const freeSpace = nodes.reduce((sum, n) => sum + (n.free_space_bytes || 0), 0) || 1.18 * 1024 * 1024 * 1024;
  const usedSpace = totalCapacity - freeSpace;
  const usedPercentage = Math.min(100, Math.round((usedSpace / (totalCapacity || 1)) * 100));

  // Storage node capacity chart data
  const nodeData = nodes.length > 0
    ? nodes.map((n) => ({
        name: n.node_name.toUpperCase(),
        used: Math.round(((n.total_space_bytes - n.free_space_bytes) / (1024 * 1024))),
        free: Math.round((n.free_space_bytes / (1024 * 1024))),
        online: n.is_online,
      }))
    : [
        { name: 'NODE1', used: 620, free: 380, online: true },
        { name: 'NODE2', used: 580, free: 420, online: true },
        { name: 'NODE3', used: 650, free: 350, online: true },
        { name: 'NODE4', used: 600, free: 400, online: true },
        { name: 'NODE5', used: 690, free: 310, online: true },
      ];

  const formatMB = (val) => `${val} MB`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Storage Capacity Gauge & Breakdown (1 Col) */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-6">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              Storage Capacity
            </h3>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800">
              N=3 Replicated
            </span>
          </div>

          <div className="mt-6 space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-slate-100">
                {(usedSpace / (1024 * 1024)).toFixed(1)} MB
              </span>
              <span className="text-xs text-slate-400 font-mono">
                / {(totalCapacity / (1024 * 1024)).toFixed(1)} MB
              </span>
            </div>

            {/* Custom Storage Progress Bar */}
            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-500 glow-cyan"
                style={{ width: `${usedPercentage}%` }}
              ></div>
            </div>

            <div className="flex justify-between text-xs text-slate-400 font-mono pt-1">
              <span>{usedPercentage}% Used</span>
              <span>{(100 - usedPercentage).toFixed(1)}% Available</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-800/80 text-xs">
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase">Replication Overhead</span>
            <p className="text-sm font-bold text-slate-200 mt-0.5">3.0x (200%)</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
            <span className="text-slate-500 text-[10px] uppercase">Storage Growth</span>
            <p className="text-sm font-bold text-emerald-400 mt-0.5 flex items-center gap-0.5">
              +14.2% <ArrowUpRight className="w-3.5 h-3.5" />
            </p>
          </div>
        </div>
      </div>

      {/* Node Utilization Chart (2 Cols) */}
      <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-emerald-400" />
            Storage Node Distribution (MB)
          </h3>
          <span className="text-xs text-slate-400">Used vs Available</span>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={nodeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={formatMB} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="used" name="Used Space (MB)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              <Bar dataKey="free" name="Available Space (MB)" fill="#1e293b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
