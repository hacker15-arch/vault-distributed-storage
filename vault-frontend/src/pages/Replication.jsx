import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Share2, CheckCircle2, AlertTriangle, ShieldCheck, ArrowDown, Sparkles, RefreshCw } from 'lucide-react';

export default function Replication() {
  const [objectKey, setObjectKey] = useState('archive/project_data.bin');
  const [replicationFactor, setReplicationFactor] = useState(3);
  const [writeQuorum, setWriteQuorum] = useState(2);
  const [readQuorum, setReadQuorum] = useState(2);
  const [isReplicating, setIsReplicating] = useState(false);

  // Deterministic mock HRW Rendezvous Hash ranking generator
  const getHRWScores = (key) => {
    const nodes = ['node1', 'node2', 'node3', 'node4', 'node5'];
    // Simple deterministic hash based on key characters
    let hashVal = 0;
    for (let i = 0; i < key.length; i++) {
      hashVal = (hashVal << 5) - hashVal + key.charCodeAt(i);
      hashVal |= 0;
    }

    const scoredNodes = nodes.map((name, idx) => {
      const score = Math.abs((hashVal * (idx + 7)) % 10000) / 10000;
      return { node_name: name, score };
    });

    scoredNodes.sort((a, b) => b.score - a.score);
    return scoredNodes;
  };

  const scoredNodes = getHRWScores(objectKey);
  const targetReplicas = scoredNodes.slice(0, replicationFactor);
  const targetNodeNames = new Set(targetReplicas.map((n) => n.node_name));

  const isQuorumValid = writeQuorum + readQuorum > replicationFactor;

  const handleSimulateReplication = () => {
    setIsReplicating(true);
    setTimeout(() => {
      setIsReplicating(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Share2 className="w-6 h-6 text-cyan-400" />
            HRW Rendezvous Replication Engine
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Visual placement engine demonstrating Highest Random Weight (HRW) hashing and quorum $W+R&gt;N$ math.
          </p>
        </div>
      </div>

      {/* Control Configuration Panel */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          Replication Placement Parameters
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="space-y-1">
            <label className="text-slate-400">Object Key Path</label>
            <input
              type="text"
              value={objectKey}
              onChange={(e) => setObjectKey(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400">Replication Factor (N)</label>
            <select
              value={replicationFactor}
              onChange={(e) => setReplicationFactor(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500/50"
            >
              <option value={1}>1 Replica</option>
              <option value={2}>2 Replicas</option>
              <option value={3}>3 Replicas (Default)</option>
              <option value={4}>4 Replicas</option>
              <option value={5}>5 Replicas (Full Cluster)</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-slate-400">Write Quorum (W)</label>
            <input
              type="number"
              min={1}
              max={replicationFactor}
              value={writeQuorum}
              onChange={(e) => setWriteQuorum(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-slate-400">Read Quorum (R)</label>
            <input
              type="number"
              min={1}
              max={replicationFactor}
              value={readQuorum}
              onChange={(e) => setReadQuorum(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* Quorum Math Banner */}
        <div className={`p-3 rounded-xl border text-xs flex items-center justify-between font-mono ${
          isQuorumValid
            ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
            : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
        }`}>
          <div className="flex items-center space-x-2">
            {isQuorumValid ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-rose-400" />}
            <span>
              Quorum Formula: W ({writeQuorum}) + R ({readQuorum}) = {writeQuorum + readQuorum} &gt; N ({replicationFactor})
            </span>
          </div>
          <span className="font-bold uppercase">
            {isQuorumValid ? 'STRICT CONSISTENCY SATISFIED' : 'QUORUM VIOLATION DETECTED'}
          </span>
        </div>
      </div>

      {/* Interactive Replica Flow Diagram */}
      <div className="glass-panel p-8 rounded-2xl border border-slate-800 flex flex-col items-center space-y-8 relative overflow-hidden">
        {/* Source Object Badge */}
        <motion.div
          animate={{ scale: isReplicating ? [1, 1.05, 1] : 1 }}
          className="p-4 rounded-2xl bg-gradient-to-tr from-cyan-600 to-emerald-600 text-slate-950 font-bold shadow-xl glow-cyan flex items-center space-x-3 z-10"
        >
          <Share2 className="w-6 h-6" />
          <div className="flex flex-col">
            <span className="text-xs font-mono uppercase opacity-80">Source Object</span>
            <span className="text-sm tracking-wide">{objectKey}</span>
          </div>
        </motion.div>

        {/* Flow Connector Arrow */}
        <div className="flex flex-col items-center text-slate-600">
          <ArrowDown className={`w-6 h-6 ${isReplicating ? 'animate-bounce text-cyan-400' : ''}`} />
          <span className="text-[10px] font-mono uppercase text-slate-400 mt-1">HRW Rendezvous Placement</span>
        </div>

        {/* Target Node Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 w-full z-10">
          {['node1', 'node2', 'node3', 'node4', 'node5'].map((nodeName) => {
            const isTarget = targetNodeNames.has(nodeName);
            const rank = scoredNodes.findIndex((n) => n.node_name === nodeName) + 1;
            const score = scoredNodes.find((n) => n.node_name === nodeName)?.score.toFixed(4);

            return (
              <motion.div
                key={nodeName}
                animate={{
                  y: isReplicating && isTarget ? [-2, 2, -2] : 0,
                }}
                className={`p-4 rounded-2xl border flex flex-col items-center justify-between text-center transition-all ${
                  isTarget
                    ? 'bg-cyan-950/60 border-cyan-400 text-slate-100 glow-cyan scale-102'
                    : 'bg-slate-900/40 border-slate-800 text-slate-500 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between w-full text-[10px] font-mono border-b border-slate-800/80 pb-1 mb-2">
                  <span className="text-slate-400">Rank #{rank}</span>
                  <span className={isTarget ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                    {isTarget ? 'REPLICA' : 'SPARE'}
                  </span>
                </div>

                <div className="my-2">
                  <h4 className="text-sm font-bold uppercase">{nodeName}</h4>
                  <p className="text-[10px] font-mono text-slate-400 mt-0.5">HRW: {score}</p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 w-full flex justify-center">
                  {isTarget ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                    </span>
                  ) : (
                    <span className="text-[11px] font-mono text-slate-500">Bypassed</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <button
          onClick={handleSimulateReplication}
          disabled={isReplicating}
          className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-slate-950 font-bold text-xs hover:from-cyan-500 hover:to-emerald-500 transition-all glow-cyan flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${isReplicating ? 'animate-spin' : ''}`} />
          <span>{isReplicating ? 'Replicating Data Payload...' : 'Re-Calculate & Simulate Placement'}</span>
        </button>
      </div>
    </div>
  );
}
