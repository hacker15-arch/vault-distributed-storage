import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Wrench, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, ArrowRight, Play, Database } from 'lucide-react';
import { getRepairStatus, repairCluster, repairSingleObject } from '../api/repairs';

export default function Repairs() {
  const [repairStatus, setRepairStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [repairing, setRepairing] = useState(false);
  const [repairReport, setRepairReport] = useState(null);

  const fetchRepairStatus = async () => {
    try {
      setLoading(true);
      const res = await getRepairStatus();
      setRepairStatus(res);
    } catch (err) {
      console.error('Failed to load repair status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepairStatus();
  }, []);

  const handleTriggerClusterRepair = async () => {
    try {
      setRepairing(true);
      const report = await repairCluster();
      setRepairReport(report);
      fetchRepairStatus();
    } catch (err) {
      alert(`Cluster repair failed: ${err.message}`);
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-amber-400" />
            Self-Healing Replica Repair Center
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Automated cluster self-healing engine restoring corrupted, stale, or missing node replicas.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchRepairStatus}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleTriggerClusterRepair}
            disabled={repairing}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 text-slate-950 text-xs font-bold hover:from-amber-500 hover:to-orange-500 transition-all glow-amber"
          >
            <Play className={`w-4 h-4 ${repairing ? 'animate-spin' : ''}`} />
            <span>{repairing ? 'Healing Cluster Replicas...' : 'Run Cluster Self-Healing Repair'}</span>
          </button>
        </div>
      </div>

      {/* Repair Report Results Banner */}
      {repairReport && (
        <div className="p-5 rounded-2xl glass-panel border border-amber-500/40 space-y-3 relative">
          <button
            onClick={() => setRepairReport(null)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-100 text-xs"
          >
            ✕
          </button>
          <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Cluster Self-Healing Scan Complete
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Scanned Objects</span>
              <p className="text-slate-100 font-bold mt-0.5">{repairReport.total_scanned}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Degraded Found</span>
              <p className="text-amber-400 font-bold mt-0.5">{repairReport.degraded_found}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Repaired Replicas</span>
              <p className="text-emerald-400 font-bold mt-0.5">{repairReport.repaired_count}</p>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Failed Repairs</span>
              <p className="text-slate-400 font-bold mt-0.5">{repairReport.failed_count}</p>
            </div>
          </div>
        </div>
      )}

      {/* Active Repair Operations Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-500 uppercase">Active In-Progress Repairs</span>
          <h3 className="text-2xl font-bold text-slate-100 mt-1">
            {repairStatus?.in_progress_count || 0}
          </h3>
          <p className="text-xs text-emerald-400 mt-1 font-mono">● Auto-Healing Idle</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-500 uppercase">Repair Throughput</span>
          <h3 className="text-2xl font-bold text-slate-100 mt-1">64.5 MB/s</h3>
          <p className="text-xs text-cyan-400 mt-1 font-mono">● In-Place Node Stream</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <span className="text-xs font-mono text-slate-500 uppercase">Estimated Recovery Time</span>
          <h3 className="text-2xl font-bold text-emerald-400 mt-1">&lt; 1.2s</h3>
          <p className="text-xs text-slate-400 mt-1 font-mono">● Zero Downtime</p>
        </div>
      </div>

      {/* Active & Historical Repair Queue List */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Wrench className="w-4 h-4 text-amber-400" />
          Replica Self-Healing Execution Log
        </h3>

        <div className="space-y-3">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-200">archive/project_data.bin (v2)</p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Restored corrupt replica on <span className="text-cyan-400">node3</span> from healthy donor <span className="text-emerald-400">node1</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="px-2.5 py-1 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                COMPLETED
              </span>
              <span className="text-slate-500">100% Repaired</span>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="font-bold text-slate-200">cluster_doc.txt (v1)</p>
                <p className="text-slate-500 text-[11px] mt-0.5">
                  Post-partition resync: updated stale <span className="text-cyan-400">node2</span> to v1 payload
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <span className="px-2.5 py-1 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-bold">
                RESYNCED
              </span>
              <span className="text-slate-500">100% Repaired</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
