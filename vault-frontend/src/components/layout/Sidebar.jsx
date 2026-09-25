import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  HardDrive,
  FolderGit2,
  Share2,
  Wrench,
  ShieldCheck,
  Scale,
  Activity,
  Terminal,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
  {
    header: 'STORAGE',
    items: [
      { name: 'Objects', path: '/admin/objects', icon: FolderGit2 },
      { name: 'Nodes', path: '/admin/nodes', icon: HardDrive },
      { name: 'Replication', path: '/admin/replication', icon: Share2 },
    ],
  },
  {
    header: 'RELIABILITY',
    items: [
      { name: 'Repairs', path: '/admin/repairs', icon: Wrench },
      { name: 'Integrity', path: '/admin/integrity', icon: ShieldCheck },
      { name: 'Rebalancing', path: '/admin/rebalancing', icon: Scale },
    ],
  },
  {
    header: 'MONITORING',
    items: [
      { name: 'Health Matrix', path: '/admin/health', icon: Activity },
      { name: 'System Logs', path: '/admin/logs', icon: Terminal },
    ],
  },
  {
    header: 'TESTING & SIMULATION',
    items: [
      { name: 'Failure Lab', path: '/admin/simulation', icon: FlaskConical },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <aside
      className={`relative z-20 flex flex-col glass-panel border-r border-slate-800/80 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800/80">
        <NavLink to="/admin/dashboard" className="flex items-center space-x-3 group">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 text-slate-950 shadow-lg glow-cyan group-hover:scale-105 transition-transform">
            <Shield className="w-6 h-6 fill-current" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg tracking-wider text-slate-100 bg-gradient-to-r from-slate-100 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
                VAULT
              </span>
              <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                Distributed Storage
              </span>
            </div>
          )}
        </NavLink>

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
          title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Main Dashboard item */}
        <div>
          <NavLink
            to="/admin/dashboard"
            className={({ isActive }) =>
              `flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`
            }
          >
            <LayoutDashboard className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>Dashboard</span>}
          </NavLink>
        </div>

        {/* Grouped Section items */}
        {navigation.slice(1).map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!collapsed && (
              <h3 className="px-3 text-[11px] font-semibold text-slate-500 tracking-wider uppercase">
                {section.header}
              </h3>
            )}
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                  title={collapsed ? item.name : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.name}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer Version Info */}
      <div className="p-4 border-t border-slate-800/80">
        <div className="flex items-center justify-between text-xs text-slate-500">
          {!collapsed && <span>Cluster Engine</span>}
          <span className="font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
            v0.5.0
          </span>
        </div>
      </div>
    </aside>
  );
}
