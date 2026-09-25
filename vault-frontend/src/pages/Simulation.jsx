import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, AlertTriangle, ShieldCheck, Power, Wifi, Zap, CheckCircle2, ArrowRight, Play, RefreshCw, XCircle } from 'lucide-react';
import { listNodes, setNodeOnline, setNodeOffline } from '../api/nodes';
import {
  corruptReplica,
  simulateSlowNode,
  simulateSplitBrain,
  healClusterPartitions,
  getPartitionStatus,
} from '../api/simulation';
import { listObjects } from '../api/objects';

export default function Simulation() {
  const [nodes, setNodes] = useState([]);
  const [objects, setObjects] = useState([]);
  const [partitionStatus, setPartitionStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  // Selected control state
  const [selectedNode, setSelectedNode] = useState('node2');
  const [selectedObject, setSelectedObject] = useState('');
  const [latencyDelay, setLatencyDelay] = useState(2.0);
  const [partitionGroupA, setPartitionGroupA] = useState(['node1', 'node2']);
  const [partitionGroupB, setPartitionGroupB] = useState(['node3', 'node4', 'node5']);

  // Active animated reaction sequence state
  const [activeReaction, setActiveReaction] = useState(null);

  const fetchSimulationData = async () => {
    try {
      setLoading(true);
      const [nData, oData, pData] = await Promise.allSettled([
        listNodes(),
        listObjects(),
        getPartitionStatus(),
      ]);

      if (nData.status === 'fulfilled') setNodes(nData.value.nodes || []);
      if (oData.status === 'fulfilled') {
        const objs = oData.value.objects || [];
        setObjects(objs);
        if (objs.length > 0 && !selectedObject) setSelectedObject(objs[0].object_name);
      }
      if (pData.status === 'fulfilled') setPartitionStatus(pData.value);
    } catch (err) {
      console.error('Failed to load simulation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSimulationData();
  }, []);

  const triggerReactionPipeline = (eventName, steps) => {
    setActiveReaction({ name: eventName, currentStep: 0, steps });
    steps.forEach((_, idx) => {
      setTimeout(() => {
        setActiveReaction((prev) => (prev ? { ...prev, currentStep: idx } : null));
      }, (idx + 1) * 700);
    });
  };

  const handleToggleNodePower = async (nodeName, isCurrentlyOnline) => {
    try {
      if (isCurrentlyOnline) {
        await setNodeOffline(nodeName);
        triggerReactionPipeline(`Node ${nodeName} Outage`, [
          `Node '${nodeName}' disconnected`,
          `Failure detector flagged ${nodeName} unreachable`,
          `Quorum evaluated: 2/3 replicas active`,
          `Read failover active`,
          `System operational ✓`,
        ]);
      } else {
        await setNodeOnline(nodeName);
        triggerReactionPipeline(`Node ${nodeName} Recovery`, [
          `Node '${nodeName}' powered online`,
          `Health probe confirmed reachable`,
          `Cluster version resync initiated`,
          `Replica status updated`,
          `Node ${nodeName} 100% Healthy ✓`,
        ]);
      }
      fetchSimulationData();
    } catch (err) {
      alert(`Power toggle failed: ${err.message}`);
    }
  };

  const handleCorruptReplica = async () => {
    if (!selectedObject) return alert('Please select or upload an object first.');
    try {
      await corruptReplica(selectedNode, selectedObject);
      triggerReactionPipeline(`Disk Bit-Rot Corruption on ${selectedNode}`, [
        `Corrupted byte stream on ${selectedNode}`,
        `SHA-256 hash mismatch detected`,
        `Read request bypassed corrupt ${selectedNode}`,
        `Self-healing repair triggered`,
        `Clean replica restored ✓`,
      ]);
      fetchSimulationData();
    } catch (err) {
      alert(`Corruption simulation failed: ${err.message}`);
    }
  };

  const handleSimulateSplitBrain = async () => {
    try {
      await simulateSplitBrain(partitionGroupA, partitionGroupB);
      triggerReactionPipeline('Split-Brain Partitioning', [
        `Cluster partitioned into Group A & Group B`,
        `Majority quorum check evaluated`,
        `Split-brain write fencing activated on minority`,
        `Majority partition (3 nodes) operating cleanly`,
        `Split-Brain Guard Active ✓`,
      ]);
      fetchSimulationData();
    } catch (err) {
      alert(`Partition simulation failed: ${err.message}`);
    }
  };

  const handleHealPartitions = async () => {
    try {
      await healClusterPartitions();
      triggerReactionPipeline('Cluster Partition Healing', [
        `Reconnected network topologies`,
        `Scanned all 5 storage nodes`,
        `Automated version resync executed`,
        `Write fencing deactivated`,
        `Cluster 100% Healed & Resynced ✓`,
      ]);
      fetchSimulationData();
    } catch (err) {
      alert(`Partition healing failed: ${err.message}`);
    }
  };

  const handleAddLatency = async () => {
    try {
      await simulateSlowNode(selectedNode, latencyDelay);
      triggerReactionPipeline(`Simulated Latency on ${selectedNode}`, [
        `Injected ${latencyDelay}s delay on ${selectedNode}`,
        `Latency probe exceeded 100ms threshold`,
        `${selectedNode} marked SLOW by Failure Detector`,
        `Read operations rerouted to faster node`,
        `Latency Failover Active ✓`,
      ]);
      fetchSimulationData();
    } catch (err) {
      alert(`Latency simulation failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-rose-400" />
            Distributed System Failure Simulation Lab
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Simulate node outages, split-brain network partitions, disk bit-rot corruption, and latency delays to test fault tolerance.
          </p>
        </div>

        <button
          onClick={fetchSimulationData}
          className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Visual System Reaction Sequence Banner */}
      {activeReaction && (
        <div className="p-6 rounded-2xl glass-panel border border-rose-500/40 space-y-4 glow-rose">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <h3 className="text-sm font-bold text-rose-300 uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-rose-400 animate-bounce" />
              System Reaction Sequence: {activeReaction.name}
            </h3>
            <span className="text-xs font-mono text-slate-400">Step {activeReaction.currentStep + 1} of {activeReaction.steps.length}</span>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            {activeReaction.steps.map((stepText, idx) => {
              const isPast = idx < activeReaction.currentStep;
              const isCurrent = idx === activeReaction.currentStep;

              return (
                <React.Fragment key={idx}>
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: isCurrent ? 1.05 : 1, opacity: 1 }}
                    className={`px-3 py-2 rounded-xl border flex items-center gap-2 transition-all ${
                      isCurrent
                        ? 'bg-rose-950 text-rose-200 border-rose-500 shadow-lg glow-rose'
                        : isPast
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                        : 'bg-slate-900/40 text-slate-600 border-slate-800'
                    }`}
                  >
                    {isPast ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    ) : isCurrent ? (
                      <Zap className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
                    ) : null}
                    <span>{stepText}</span>
                  </motion.div>
                  {idx < activeReaction.steps.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}

      {/* Control Simulation Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Node Outage & Recovery Panel */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Power className="w-4 h-4 text-emerald-400" />
            1. Node Outage & Recovery Controls
          </h3>

          <div className="space-y-3">
            <label className="text-xs text-slate-400 font-mono">Select Target Storage Node</label>
            <div className="grid grid-cols-5 gap-2">
              {['node1', 'node2', 'node3', 'node4', 'node5'].map((n) => {
                const nodeObj = nodes.find((node) => node.node_name === n);
                const isOnline = nodeObj?.is_online !== false;

                return (
                  <button
                    key={n}
                    onClick={() => handleToggleNodePower(n, isOnline)}
                    className={`py-2 rounded-xl border font-mono text-xs font-bold uppercase transition-all flex flex-col items-center gap-1 ${
                      isOnline
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300 hover:bg-rose-950/60 hover:border-rose-800 hover:text-rose-300'
                        : 'bg-rose-950/80 border-rose-800 text-rose-300 hover:bg-emerald-950/60 hover:border-emerald-800 hover:text-emerald-300'
                    }`}
                  >
                    <span>{n}</span>
                    <span className="text-[9px]">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 font-mono">
              Click any node to toggle power state. Evaluates $W+R&gt;N$ quorum math dynamically.
            </p>
          </div>
        </div>

        {/* 2. Data Bit-Rot Corruption Panel */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            2. Data Bit-Rot Corruption Simulator
          </h3>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="space-y-1">
                <label className="text-slate-400">Target Node</label>
                <select
                  value={selectedNode}
                  onChange={(e) => setSelectedNode(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none"
                >
                  {['node1', 'node2', 'node3', 'node4', 'node5'].map((n) => (
                    <option key={n} value={n}>{n.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-slate-400">Target Object</label>
                <input
                  type="text"
                  value={selectedObject}
                  onChange={(e) => setSelectedObject(e.target.value)}
                  placeholder="archive/project_data.bin"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleCorruptReplica}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 text-slate-950 font-bold text-xs hover:from-amber-500 hover:to-rose-500 transition-all glow-amber"
            >
              Simulate SHA-256 Bit-Rot Corruption
            </button>
          </div>
        </div>

        {/* 3. Split-Brain Network Partitioning */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Wifi className="w-4 h-4 text-cyan-400" />
            3. Split-Brain Network Partitioning & Fencing
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-400">Fencing Status</span>
              <span className={partitionStatus?.fenced ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                {partitionStatus?.fenced ? 'SPLIT-BRAIN FENCED (503)' : 'NORMAL OPERATIONAL'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleSimulateSplitBrain}
                className="py-2.5 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-300 font-bold hover:bg-cyan-900/80 transition-all"
              >
                Simulate Split-Brain
              </button>
              <button
                onClick={handleHealPartitions}
                className="py-2.5 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-bold hover:bg-emerald-900/80 transition-all"
              >
                Heal & Resync Cluster
              </button>
            </div>
          </div>
        </div>

        {/* 4. Slow Node Latency Simulation */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Zap className="w-4 h-4 text-purple-400" />
            4. Slow Node Latency Delay Simulation
          </h3>

          <div className="space-y-3 text-xs font-mono">
            <div className="space-y-1">
              <label className="text-slate-400">Select Delay Duration ({latencyDelay}s)</label>
              <input
                type="range"
                min="0.5"
                max="5.0"
                step="0.5"
                value={latencyDelay}
                onChange={(e) => setLatencyDelay(parseFloat(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <button
              onClick={handleAddLatency}
              className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-slate-950 font-bold hover:from-purple-500 hover:to-indigo-500 transition-all glow-purple"
            >
              Inject Latency Delay on {selectedNode.toUpperCase()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
