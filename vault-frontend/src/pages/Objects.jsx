import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  FolderGit2,
  Search,
  Upload,
  Download,
  Trash2,
  ShieldCheck,
  Eye,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { listObjects, deleteObject, downloadObjectUrl, verifyObjectIntegrity } from '../api/objects';
import UploadModal from '../components/objects/UploadModal';

export default function Objects() {
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [verifyingKey, setVerifyingKey] = useState(null);
  const [verifyReport, setVerifyReport] = useState(null);

  const fetchObjects = async () => {
    try {
      setLoading(true);
      const res = await listObjects();
      setObjects(res.objects || []);
    } catch (err) {
      console.error('Failed to load objects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchObjects();
  }, []);

  const handleDelete = async (objectName) => {
    if (!window.confirm(`Are you sure you want to delete '${objectName}' across all node replicas?`)) return;
    try {
      await deleteObject(objectName);
      fetchObjects();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleVerify = async (objectName) => {
    try {
      setVerifyingKey(objectName);
      const report = await verifyObjectIntegrity(objectName);
      setVerifyReport(report);
    } catch (err) {
      alert(`Verification failed: ${err.message}`);
    } finally {
      setVerifyingKey(null);
    }
  };

  const filteredObjects = objects.filter((o) =>
    o.object_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Action Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-2xl border border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <FolderGit2 className="w-6 h-6 text-cyan-400" />
            Distributed Object Browser
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse, inspect, upload, and verify binary objects across the Vault cluster.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchObjects}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
            title="Refresh Object List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-slate-950 text-xs font-bold hover:from-cyan-500 hover:to-emerald-500 transition-all glow-cyan"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Object</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search objects by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing <span className="text-cyan-400 font-bold">{filteredObjects.length}</span> of {objects.length} objects
        </div>
      </div>

      {/* Verification Modal Banner */}
      {verifyReport && (
        <div className="p-4 rounded-2xl glass-panel border border-cyan-500/40 space-y-2 relative">
          <button
            onClick={() => setVerifyReport(null)}
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-100 text-xs"
          >
            ✕
          </button>
          <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            SHA-256 Integrity Verification Report: {verifyReport.object_name}
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-1">
            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Status</span>
              <p className={verifyReport.is_healthy ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                {verifyReport.is_healthy ? 'HEALTHY' : 'CORRUPTED'}
              </p>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Healthy Replicas</span>
              <p className="text-slate-200 font-bold">{verifyReport.healthy_count} / {verifyReport.total_replicas}</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Corrupted</span>
              <p className="text-amber-400 font-bold">{verifyReport.corrupted_count}</p>
            </div>
            <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800">
              <span className="text-slate-500 text-[10px]">Version</span>
              <p className="text-cyan-400 font-bold">v{verifyReport.version}</p>
            </div>
          </div>
        </div>
      )}

      {/* Object Browser Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3.5 px-4">Name / Key Path</th>
                <th className="py-3.5 px-4">Size</th>
                <th className="py-3.5 px-4">Version</th>
                <th className="py-3.5 px-4">Replicas</th>
                <th className="py-3.5 px-4">Health</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500 font-mono">
                    Loading objects catalog...
                  </td>
                </tr>
              ) : filteredObjects.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500 font-mono">
                    No objects found in cluster metadata catalog.
                  </td>
                </tr>
              ) : (
                filteredObjects.map((obj) => {
                  const sizeMB = (obj.size / (1024 * 1024)).toFixed(2);
                  const replicaCount = obj.replicas ? obj.replicas.length : 3;

                  return (
                    <tr key={obj.object_name} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-100 flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        <span className="truncate max-w-xs">{obj.object_name}</span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-400">{sizeMB} MB</td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono text-[11px]">
                          v{obj.version}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-slate-300">
                        {replicaCount} / 3 Replicas
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800 text-[11px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" /> Healthy
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleVerify(obj.object_name)}
                          disabled={verifyingKey === obj.object_name}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60"
                          title="Verify SHA-256 Integrity"
                        >
                          <ShieldCheck className={`w-4 h-4 ${verifyingKey === obj.object_name ? 'animate-spin' : ''}`} />
                        </button>
                        <a
                          href={downloadObjectUrl(obj.object_name)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-slate-800/60"
                          title="Download Object"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(obj.object_name)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/60"
                          title="Delete Object Replicas"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload Modal Popup */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={fetchObjects}
      />
    </div>
  );
}
