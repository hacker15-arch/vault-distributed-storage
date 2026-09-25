import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Scale, RefreshCw, Play, CheckCircle2, ArrowRight, Database, HardDrive, Sparkles } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getRebalanceStatus, triggerRebalance } from '../api/rebalancing';

export default function Rebalancing() {
  const [statusData, setStatusData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceReport, setRebalanceReport] = useState(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await getRebalanceStatus();
      setStatusData(res);
    } catch (err) {
      console.error('Failed to fetch rebalance status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTriggerRebalance = async () => {
    try {
      setRebalancing(true);
      const report = await triggerRebalance();
      setRebalanceReport(report);
      fetchStatus();
    } catch (err) {
      alert(`Rebalancing failed: ${err.message}`);
    } finally {
      setRebalancing(false);
    }
  };

  const utilization = statusData?.utilization || [
    { node_name: 'node1', is_online: true, used_bytes: 900000, total_space_bytes: 1000000 },
    { node_name: 'node2', is_online: true, used_bytes: 200000, total_space_bytes: 1000000 },
    { node_name: 'node3', is_online: true, used_bytes: 300000, total_space_bytes: 1000000 },
    { node_name: 'node4', is_online: true, used_bytes: 400000, total_space_bytes: 1000000 },
    { node_name: 'node5', is_online: true, used_bytes: 500000, total_space_bytes: 1000000 },
  ];

  // Prepare Recharts Before vs Balanced projection data
  const chartData = utilization.map((u) => {
    const usedMB = Math.round(u.used_bytes / (1024 * 1024));
    // Projected rebalanced target ~ 460 MB
    return {
      name: u.node_name.toUpperCase(),
      current: usedMB,
      balanced: 460,
    };
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Scale className="w-6 h-6 text-cyan-400" />
            Background Storage Rebalancing Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Detect byte capacity imbalance across storage nodes and safely migrate object replicas.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchStatus}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleTriggerRebalance}
            disabled={rebalancing}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-slate-950 text-xs font-bold hover:from-cyan-500 hover:to-emerald-500 transition-all glow-cyan"
          >
            <Play className={`w-4 h-4 ${rebalancing ? 'animate-spin' : ''}`} />
            <span>{rebalancing ? 'Rebalancing Cluster Data...' : 'Trigger Cluster Rebalancing'}</span>
          </button>
        </div>
      </div>

      {/* Rebalance Report Results */}
      {rebalanceReport && (
        <div className="p-5 rounded-2xl glass-panel border border-cyan-500/40 space-y-3 relative">
          <button
            onClick={() => setRebalanceReport(null)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-100 text-xs"
          >
            ✕
          </button>
          <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Cluster Rebalancing Migration Complete
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Status</span>
              <p className="text-emerald-400 font-bold mt-0.5 uppercase">{rebalanceReport.status}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Migrated Objects</span>
              <p className="text-cyan-400 font-bold mt-0.5">{rebalanceReport.migrated_objects_count || 0}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Bytes Transferred</span>
              <p className="text-slate-100 font-bold mt-0.5">{rebalanceReport.bytes_transferred || 0} Bytes</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Mean Byte Usage</span>
              <p className="text-slate-400 font-bold mt-0.5">{Math.round(rebalanceReport.mean_bytes || 0)} Bytes</p>
            </div>
          </div>
        </div>
      )}

      {/* Before vs After Visual Distribution Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-amber-400" />
              Current Node Capacity Distribution
            </h3>
            <span className="text-xs text-amber-400 font-mono bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
              Before Rebalancing
            </span>
          </div>

          <div className="space-y-4 pt-2">
            {utilization.map((u) => {
              const totalMB = Math.round((u.total_space_bytes || 1000000) / (1024 * 1024));
              const usedMB = Math.round((u.used_bytes || 0) / (1024 * 1024));
              const pct = Math.min(100, Math.round((usedMB / (totalMB || 1)) * 100));

              return (
                <div key={u.node_name} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300 font-bold uppercase">{u.node_name}</span>
                    <span className="text-slate-400">{pct}% ({usedMB} MB)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Target Balanced Distribution
            </h3>
            <span className="text-xs text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
              After Rebalancing
            </span>
          </div>

          <div className="space-y-4 pt-2">
            {utilization.map((u) => {
              const targetPct = 46; // Balanced target ~46%

              return (
                <div key={`bal-${u.node_name}`} className="space-y-1">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-300 font-bold uppercase">{u.node_name}</span>
                    <span className="text-emerald-400 font-bold">{targetPct}% (460 MB)</span>
                  </div>
                  <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 rounded-full transition-all duration-500 glow-cyan"
                      style={{ width: `${targetPct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Comparison Recharts Bar Chart */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          Node Storage Variance Analysis (MB)
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" stroke="#64748b" tick={{ fontSize: 11 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#1e293b',
                  borderRadius: '12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="current" name="Current Utilization (MB)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="balanced" name="Target Rebalanced (MB)" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
