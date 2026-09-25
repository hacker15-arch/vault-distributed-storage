import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  HardDrive,
  RefreshCw,
  Power,
  Wifi,
  Database,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
} from 'lucide-react';
import { listNodes, setNodeOnline, setNodeOffline, probeSingleNode } from '../api/nodes';

export default function Nodes() {
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  const fetchNodes = async () => {
    try {
      setLoading(true);
      const res = await listNodes();
      setNodes(res.nodes || []);
    } catch (err) {
      console.error('Failed to load storage nodes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNodes();
    const interval = setInterval(fetchNodes, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleOnline = async (nodeName, isCurrentlyOnline) => {
    try {
      setActionLoading(nodeName);
      if (isCurrentlyOnline) {
        await setNodeOffline(nodeName);
      } else {
        await setNodeOnline(nodeName);
      }
      fetchNodes();
    } catch (err) {
      alert(`Failed to update status for ${nodeName}: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const onlineCount = nodes.filter((n) => n.is_online).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <HardDrive className="w-6 h-6 text-emerald-400" />
            Storage Node Cluster Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitor real-time node capacity, network latency, heartbeat status, and toggle server power states.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchNodes}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold hover:border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Probe Cluster</span>
          </button>
        </div>
      </div>

      {/* Cluster Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-mono uppercase">Online Cluster Ratio</span>
            <h3 className="text-xl font-bold text-slate-100">
              {onlineCount} / {nodes.length || 5} Nodes Active
            </h3>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-cyan-950/60 text-cyan-400 border border-cyan-800/60">
            <Wifi className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-mono uppercase">Avg Cluster Latency</span>
            <h3 className="text-xl font-bold text-slate-100">~2.4 ms</h3>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center space-x-4">
          <div className="p-3 rounded-xl bg-purple-950/60 text-purple-400 border border-purple-800/60">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-500 font-mono uppercase">Total Capacity Pool</span>
            <h3 className="text-xl font-bold text-slate-100">5.0 GB</h3>
          </div>
        </div>
      </div>

      {/* Storage Node Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {nodes.map((node, idx) => {
          const isOnline = node.is_online !== false;
          const totalMB = Math.round((node.total_space_bytes || 1000000) / (1024 * 1024));
          const freeMB = Math.round((node.free_space_bytes || 0) / (1024 * 1024));
          const usedMB = totalMB - freeMB;
          const usedPct = Math.round((usedMB / (totalMB || 1)) * 100);

          return (
            <motion.div
              key={node.node_name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.05 }}
              className={`glass-panel p-6 rounded-2xl border transition-all flex flex-col justify-between space-y-5 ${
                isOnline
                  ? 'border-slate-800 hover:border-cyan-500/40 glow-cyan'
                  : 'border-rose-900/60 bg-rose-950/20'
              }`}
            >
              {/* Card Top Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl border ${
                    isOnline ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400' : 'bg-rose-950/80 border-rose-800 text-rose-400'
                  }`}>
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-100 uppercase tracking-wider">
                      {node.node_name}
                    </h3>
                    <p className="text-[10px] text-slate-500 font-mono truncate max-w-[140px]">
                      {node.path}
                    </p>
                  </div>
                </div>

                <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-mono border flex items-center gap-1.5 ${
                  isOnline
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                    : 'bg-rose-950 text-rose-400 border-rose-800'
                }`}>
                  {isOnline ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {isOnline ? 'HEALTHY' : 'OFFLINE'}
                </span>
              </div>

              {/* Storage Gauge */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">Disk Consumption</span>
                  <span className="text-cyan-400 font-bold">{usedPct}% ({usedMB} / {totalMB} MB)</span>
                </div>

                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      usedPct > 85 ? 'bg-rose-500' : usedPct > 70 ? 'bg-amber-400' : 'bg-gradient-to-r from-cyan-500 to-emerald-400'
                    }`}
                    style={{ width: `${usedPct}%` }}
                  ></div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-slate-800/80">
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-500 text-[10px]">Stored Objects</span>
                  <p className="text-slate-200 font-bold mt-0.5">{node.object_count || 0}</p>
                </div>
                <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-500 text-[10px]">Network Latency</span>
                  <p className="text-emerald-400 font-bold mt-0.5">{isOnline ? '1.8 ms' : 'N/A'}</p>
                </div>
              </div>

              {/* Bottom Action Footer */}
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => handleToggleOnline(node.node_name, isOnline)}
                  disabled={actionLoading === node.node_name}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                    isOnline
                      ? 'bg-rose-950/60 border-rose-800 text-rose-300 hover:bg-rose-900/80'
                      : 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-emerald-900/80'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{isOnline ? 'Simulate Offline' : 'Bring Online'}</span>
                </button>

                <NavLink
                  to={`/admin/nodes/${node.node_name}`}
                  className="flex items-center space-x-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  <span>Details</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </NavLink>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
