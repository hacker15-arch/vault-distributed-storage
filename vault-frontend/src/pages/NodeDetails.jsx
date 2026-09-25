import React, { useEffect, useState } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  HardDrive,
  ArrowLeft,
  Power,
  Wifi,
  Database,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { getNodeDetails, setNodeOnline, setNodeOffline, probeSingleNode } from '../api/nodes';
import { simulateSlowNode } from '../api/simulation';

export default function NodeDetails() {
  const { nodeId } = useParams();
  const [node, setNode] = useState(null);
  const [probe, setProbe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [slowLatency, setSlowLatency] = useState(0.5);

  const fetchDetails = async () => {
    try {
      setLoading(true);
      const [nData, pData] = await Promise.allSettled([
        getNodeDetails(nodeId),
        probeSingleNode(nodeId),
      ]);

      if (nData.status === 'fulfilled') setNode(nData.value);
      if (pData.status === 'fulfilled') setProbe(pData.value);
    } catch (err) {
      console.error(`Failed to load node details for ${nodeId}:`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [nodeId]);

  const handleToggleOnline = async () => {
    if (!node) return;
    try {
      if (node.is_online) {
        await setNodeOffline(nodeId);
      } else {
        await setNodeOnline(nodeId);
      }
      fetchDetails();
    } catch (err) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  const handleAddLatency = async () => {
    try {
      await simulateSlowNode(nodeId, slowLatency);
      alert(`Simulated ${slowLatency}s latency delay on ${nodeId}`);
      fetchDetails();
    } catch (err) {
      alert(`Failed to add latency: ${err.message}`);
    }
  };

  const isOnline = node?.is_online !== false;
  const totalMB = Math.round((node?.total_space_bytes || 1000000) / (1024 * 1024));
  const freeMB = Math.round((node?.free_space_bytes || 0) / (1024 * 1024));
  const usedMB = totalMB - freeMB;
  const usedPct = Math.round((usedMB / (totalMB || 1)) * 100);

  // Mock historical latency trends for Recharts
  const latencyTrendData = [
    { time: '12:00', latency: 1.8 },
    { time: '12:05', latency: 2.1 },
    { time: '12:10', latency: 1.9 },
    { time: '12:15', latency: 2.4 },
    { time: '12:20', latency: 2.0 },
    { time: '12:25', latency: 1.7 },
  ];

  return (
    <div className="space-y-6">
      {/* Top Navigation */}
      <div>
        <NavLink
          to="/admin/nodes"
          className="inline-flex items-center space-x-1.5 text-xs text-slate-400 hover:text-cyan-400 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Storage Nodes</span>
        </NavLink>
      </div>

      {/* Node Header */}
      <div className="glass-card p-6 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className={`p-4 rounded-2xl border ${
            isOnline ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' : 'bg-rose-950/80 border-rose-800 text-rose-400'
          }`}>
            <HardDrive className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-slate-100 uppercase tracking-wider">{nodeId}</h1>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono border flex items-center gap-1 ${
                isOnline ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-950 text-rose-400 border-rose-800'
              }`}>
                {isOnline ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {isOnline ? 'ONLINE & HEALTHY' : 'OFFLINE'}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-1">Directory Path: {node?.path || 'N/A'}</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleToggleOnline}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
              isOnline
                ? 'bg-rose-950/60 border-rose-800 text-rose-300 hover:bg-rose-900/80'
                : 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/80'
            }`}
          >
            <Power className="w-4 h-4" />
            <span>{isOnline ? 'Take Node Offline' : 'Bring Node Online'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-500 uppercase font-mono">Storage Used</span>
          <h3 className="text-xl font-bold text-slate-100 mt-1">{usedMB} MB ({usedPct}%)</h3>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-500 uppercase font-mono">Free Space</span>
          <h3 className="text-xl font-bold text-slate-100 mt-1">{freeMB} MB</h3>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-500 uppercase font-mono">Stored Replicas</span>
          <h3 className="text-xl font-bold text-cyan-400 mt-1">{node?.object_count || 0} Files</h3>
        </div>
        <div className="glass-panel p-4 rounded-2xl border border-slate-800">
          <span className="text-xs text-slate-500 uppercase font-mono">Latency Score</span>
          <h3 className="text-xl font-bold text-emerald-400 mt-1">{probe ? `${probe.latency_ms.toFixed(1)} ms` : '1.8 ms'}</h3>
        </div>
      </div>

      {/* Latency & Simulation Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Latency Chart */}
        <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-800">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-cyan-400" />
            Node Response Latency Trend (ms)
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="latencyGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
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
                <Area type="monotone" dataKey="latency" stroke="#06b6d4" strokeWidth={2} fillOpacity={1} fill="url(#latencyGlow)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Latency Simulation Panel */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Simulate Latency Delay
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Add artificial network/disk latency delay to test node failure detection and read rerouting.
            </p>
          </div>

          <div className="space-y-3">
            <label className="text-xs text-slate-400 font-mono">Select Delay Duration (Seconds)</label>
            <input
              type="range"
              min="0.1"
              max="5.0"
              step="0.1"
              value={slowLatency}
              onChange={(e) => setSlowLatency(parseFloat(e.target.value))}
              className="w-full accent-cyan-400"
            />
            <div className="text-center text-sm font-mono font-bold text-amber-400">
              {slowLatency} Seconds Delay
            </div>
            <button
              onClick={handleAddLatency}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-slate-950 font-bold text-xs hover:from-amber-500 hover:to-orange-500 transition-all glow-amber"
            >
              Apply Simulated Latency
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
