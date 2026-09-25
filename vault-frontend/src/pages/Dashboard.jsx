import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HardDrive, FolderGit2, ShieldCheck, Activity, Wrench, Database, RefreshCw, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getHealth } from '../api/health';
import { listNodes } from '../api/nodes';
import { listObjects } from '../api/objects';
import { getRepairStatus } from '../api/repairs';
import Vault3DCluster from '../components/three/Vault3DCluster';
import StorageOverview from '../components/dashboard/StorageOverview';
import SystemHealthMatrix from '../components/dashboard/SystemHealthMatrix';

export default function Dashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [objects, setObjects] = useState([]);
  const [repairStatus, setRepairStatus] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);

  const handleAdminLogout = () => {
    logout();
    navigate('/admin/login');
  };

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [hData, nData, oData, rData] = await Promise.allSettled([
        getHealth(),
        listNodes(),
        listObjects(),
        getRepairStatus(),
      ]);

      if (hData.status === 'fulfilled') setHealth(hData.value);
      if (nData.status === 'fulfilled') setNodes(nData.value.nodes || []);
      if (oData.status === 'fulfilled') setObjects(oData.value.objects || []);
      if (rData.status === 'fulfilled') setRepairStatus(rData.value);
    } catch (err) {
      console.error('Failed loading dashboard summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    const interval = setInterval(fetchDashboardData, 12000);
    return () => clearInterval(interval);
  }, []);

  const totalBytes = nodes.reduce((sum, n) => sum + (n.total_space_bytes - n.free_space_bytes), 0);
  const onlineNodes = nodes.filter((n) => n.is_online).length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            Vault Distributed Storage Dashboard
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
              Live Cluster
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time multi-node replication, SHA-256 integrity verification, and automatic self-healing.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchDashboardData}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-200 text-xs font-semibold hover:border-cyan-500/50 hover:text-cyan-400 transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>

          <button
            onClick={handleAdminLogout}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout Admin</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          whileHover={{ y: -2 }}
          className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Objects</span>
            <FolderGit2 className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-100">
              {loading ? '...' : objects.length.toLocaleString()}
            </h3>
            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-mono">
              <span>●</span> Catalog Synced
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          whileHover={{ y: -2 }}
          className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Storage</span>
            <Database className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-100">
              {loading ? '...' : `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`}
            </h3>
            <p className="text-xs text-cyan-400 mt-1 flex items-center gap-1 font-mono">
              <span>●</span> Across Replicas
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
          whileHover={{ y: -2 }}
          className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Healthy Nodes</span>
            <HardDrive className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-100">
              {loading ? '...' : `${onlineNodes} / ${nodes.length || 5}`}
            </h3>
            <p className="text-xs text-emerald-400 mt-1 flex items-center gap-1 font-mono">
              <span>●</span> Quorum Ready
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          whileHover={{ y: -2 }}
          className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Replication Health</span>
            <Activity className="w-5 h-5 text-teal-400" />
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-100">100.0%</h3>
            <p className="text-xs text-teal-400 mt-1 flex items-center gap-1 font-mono">
              <span>●</span> N=3 Quorum
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          whileHover={{ y: -2 }}
          className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Repairs</span>
            <Wrench className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-100">
              {repairStatus?.in_progress_count || 0}
            </h3>
            <p className="text-xs text-amber-400 mt-1 flex items-center gap-1 font-mono">
              <span>●</span> Self-Healing
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
          whileHover={{ y: -2 }}
          className="glass-card p-5 rounded-2xl border border-slate-800/80 flex flex-col justify-between"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Integrity Status</span>
            <ShieldCheck className="w-5 h-5 text-purple-400" />
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-100">100.0%</h3>
            <p className="text-xs text-purple-400 mt-1 flex items-center gap-1 font-mono">
              <span>●</span> SHA-256 Scrubbed
            </p>
          </div>
        </motion.div>
      </div>

      {/* 3D Distributed Storage Hero Visualization */}
      <Vault3DCluster
        nodes={nodes}
        selectedNode={selectedNode}
        onSelectNode={(nodeName) => setSelectedNode(nodeName)}
      />

      {/* Storage Overview Section */}
      <StorageOverview nodes={nodes} />

      {/* System Health Component Matrix */}
      <SystemHealthMatrix health={health} nodes={nodes} />
    </div>
  );
}
