import React, { useState, useEffect } from 'react';
import { Terminal, Filter, Trash2, Copy, Pause, Play, Check } from 'lucide-react';

const initialLogs = [
  { id: 1, timestamp: '12:41:22', level: 'INFO', message: 'Object uploaded: archive/project_data.bin (v1)' },
  { id: 2, timestamp: '12:41:24', level: 'INFO', message: 'Replica created on node3, node1, node2 (Write Quorum 3/2)' },
  { id: 3, timestamp: '12:41:25', level: 'WARNING', message: 'Node3 marked slow (Latency delay > 100ms)' },
  { id: 4, timestamp: '12:41:28', level: 'ERROR', message: 'Replica corruption detected on node3 during integrity scan' },
  { id: 5, timestamp: '12:41:30', level: 'INFO', message: 'Self-healing repair started for archive/project_data.bin' },
  { id: 6, timestamp: '12:41:34', level: 'SUCCESS', message: 'Replica repair completed: node3 updated from healthy node1 donor' },
  { id: 7, timestamp: '12:41:40', level: 'INFO', message: 'SQLite WAL metadata transaction committed successfully' },
  { id: 8, timestamp: '12:41:45', level: 'INFO', message: 'HRW Rendezvous Hash calculated for key maj_doc.txt' },
];

export default function Logs() {
  const [logs, setLogs] = useState(initialLogs);
  const [filterLevel, setFilterLevel] = useState('ALL');
  const [isLive, setIsLive] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const sampleEvents = [
        { level: 'INFO', message: 'Heartbeat probe completed across 5 storage nodes (0 failures)' },
        { level: 'INFO', message: 'Object read request served from node1 (Quorum achieved: 2/2)' },
        { level: 'SUCCESS', message: 'Background integrity check: 100% clean across replicas' },
        { level: 'INFO', message: 'Storage capacity probe: Mean byte variance within threshold' },
      ];
      const randomEvent = sampleEvents[Math.floor(Math.random() * sampleEvents.length)];

      setLogs((prev) => [
        ...prev.slice(-99),
        { id: Date.now(), timestamp: timeStr, ...randomEvent },
      ]);
    }, 4000);

    return () => clearInterval(interval);
  }, [isLive]);

  const handleCopyLogs = () => {
    const text = logs.map((l) => `${l.timestamp} [${l.level}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((l) => {
    if (filterLevel === 'ALL') return true;
    return l.level === filterLevel;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Terminal className="w-6 h-6 text-cyan-400" />
            Real-Time System Logs Terminal
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Live operational log stream tracking object uploads, replica creations, node probes, and repairs.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
              isLive ? 'bg-emerald-950/80 border-emerald-800 text-emerald-400' : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            {isLive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isLive ? 'Pause Stream' : 'Resume Stream'}</span>
          </button>
          <button
            onClick={handleCopyLogs}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            title="Copy Logs to Clipboard"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setLogs([])}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400"
            title="Clear Console"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-2 text-xs font-mono">
        {['ALL', 'INFO', 'WARNING', 'ERROR', 'SUCCESS'].map((lvl) => (
          <button
            key={lvl}
            onClick={() => setFilterLevel(lvl)}
            className={`px-3 py-1.5 rounded-xl border transition-all ${
              filterLevel === lvl
                ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50 font-bold'
                : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            {lvl}
          </button>
        ))}
      </div>

      {/* Console Window */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 font-mono text-xs bg-slate-950/90 shadow-2xl h-[480px] overflow-y-auto space-y-2">
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 text-center py-20">Console cleared. Awaiting logs...</div>
        ) : (
          filteredLogs.map((log) => {
            const levelColor =
              log.level === 'INFO'
                ? 'text-cyan-400'
                : log.level === 'WARNING'
                ? 'text-amber-400'
                : log.level === 'ERROR'
                ? 'text-rose-400 font-bold'
                : 'text-emerald-400 font-bold';

            return (
              <div key={log.id} className="flex items-start space-x-3 py-0.5 hover:bg-slate-900/40 rounded px-2">
                <span className="text-slate-500 flex-shrink-0">{log.timestamp}</span>
                <span className={`w-20 flex-shrink-0 font-bold ${levelColor}`}>[{log.level}]</span>
                <span className="text-slate-200">{log.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
