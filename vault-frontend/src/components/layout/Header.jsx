import React, { useEffect, useState } from 'react';
import { Search, Bell, Shield, User, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getHealth } from '../../api/health';

export default function Header() {
  const [healthStatus, setHealthStatus] = useState('healthy');
  const [loading, setLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await getHealth();
      setHealthStatus(res.status || 'healthy');
    } catch (err) {
      setHealthStatus('unreachable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-16 px-6 glass-panel border-b border-slate-800/80">
      {/* Search Input */}
      <div className="flex items-center space-x-4 flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search objects, nodes, hashes..."
            className="w-full pl-10 pr-4 py-1.5 text-sm bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-all"
          />
        </div>
      </div>

      {/* Header Actions */}
      <div className="flex items-center space-x-4">
        {/* System Status Indicator */}
        <div
          onClick={fetchStatus}
          className="cursor-pointer flex items-center space-x-2 px-3 py-1.5 rounded-full glass-card border border-slate-800 text-xs font-medium hover:border-slate-700 transition-colors"
          title="Click to refresh cluster status"
        >
          {healthStatus === 'healthy' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-emerald-400 font-semibold">Operational</span>
            </>
          ) : healthStatus === 'degraded' ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
              <span className="text-amber-400 font-semibold">Degraded</span>
            </>
          ) : (
            <>
              <span className="relative flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
              </span>
              <span className="text-rose-400 font-semibold">Offline</span>
            </>
          )}

          <RefreshCw className={`w-3 h-3 text-slate-400 ml-1 ${loading ? 'animate-spin' : ''}`} />
        </div>

        {/* Notifications Toggle */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-cyan-500 rounded-full glow-cyan"></span>
          </button>

          {/* Notifications Dropdown Modal */}
          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 glass-panel rounded-2xl p-4 shadow-2xl border border-slate-800 space-y-3 z-50">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h4 className="text-sm font-semibold text-slate-200">Notifications</h4>
                <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-2 py-0.5 rounded-full">
                  Live
                </span>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 flex items-start space-x-2 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-slate-200 font-medium">Cluster Initialization Complete</p>
                    <p className="text-slate-500 text-[11px]">All 5 nodes connected cleanly.</p>
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/60 flex items-start space-x-2 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-slate-200 font-medium">Quorum Consistency Enforced</p>
                    <p className="text-slate-500 text-[11px]">W=2, R=2 quorum rules active.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile Avatar */}
        <div className="flex items-center space-x-3 pl-3 border-l border-slate-800">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-600 to-indigo-600 flex items-center justify-center text-white font-semibold text-xs shadow-md">
            AD
          </div>
          <div className="hidden md:flex flex-col">
            <span className="text-xs font-semibold text-slate-200">Vault Admin</span>
            <span className="text-[10px] text-slate-500">Root Cluster</span>
          </div>
        </div>
      </div>
    </header>
  );
}
