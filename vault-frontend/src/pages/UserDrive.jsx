import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  UploadCloud,
  Search,
  Download,
  Trash2,
  FileText,
  FileCode,
  Image as ImageIcon,
  FileArchive,
  Grid,
  List,
  LogOut,
  User,
  CheckCircle2,
  Share2,
  HardDrive,
  ShieldCheck,
  History,
  Sparkles,
} from 'lucide-react';
import { listObjects, deleteObject, downloadObjectUrl } from '../api/objects';
import UploadModal from '../components/objects/UploadModal';
import { useAuth } from '../context/AuthContext';

export default function UserDrive() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);
  const [historyModalKey, setHistoryModalKey] = useState(null);

  const fetchUserFiles = async () => {
    try {
      setLoading(true);
      const res = await listObjects();
      setObjects(res.objects || []);
    } catch (err) {
      console.error('Failed to load user files:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserFiles();
  }, []);

  const handleDelete = async (objectName) => {
    if (!window.confirm(`Are you sure you want to delete '${objectName}'?`)) return;
    try {
      await deleteObject(objectName);
      fetchUserFiles();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleCopyShareLink = (objectName) => {
    const url = downloadObjectUrl(objectName);
    navigator.clipboard.writeText(url);
    alert(`Public download link copied to clipboard!\n${url}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const totalBytes = objects.reduce((sum, o) => sum + (o.size || 0), 0);
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  const quotaLimitMB = 5000;
  const usedPercentage = Math.min(100, ((totalBytes / (quotaLimitMB * 1024 * 1024)) * 100).toFixed(1));

  const filteredObjects = objects.filter((o) => {
    const matchesSearch = o.object_name.toLowerCase().includes(searchQuery.toLowerCase());
    if (filterType === 'ALL') return matchesSearch;
    if (filterType === 'DOCS') return matchesSearch && (o.object_name.endsWith('.pdf') || o.object_name.endsWith('.txt') || o.object_name.endsWith('.doc'));
    if (filterType === 'IMAGES') return matchesSearch && (o.object_name.endsWith('.jpg') || o.object_name.endsWith('.png') || o.object_name.endsWith('.svg'));
    return matchesSearch;
  });

  const getFileIcon = (name) => {
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')) return <ImageIcon className="w-5 h-5 text-teal-400" />;
    if (name.endsWith('.pdf') || name.endsWith('.txt') || name.endsWith('.doc')) return <FileText className="w-5 h-5 text-cyan-400" />;
    if (name.endsWith('.zip') || name.endsWith('.tar') || name.endsWith('.gz')) return <FileArchive className="w-5 h-5 text-amber-400" />;
    return <FileCode className="w-5 h-5 text-purple-400" />;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Clean Header Bar */}
      <header className="sticky top-0 z-20 glass-panel border-b border-slate-800/80 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-cyan-600 to-emerald-500 text-slate-950 shadow-lg glow-cyan">
            <Shield className="w-6 h-6 fill-current" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-lg tracking-wider bg-gradient-to-r from-slate-100 via-cyan-200 to-emerald-300 bg-clip-text text-transparent">
              VAULT DRIVE
            </span>
            <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
              Secure Cloud Storage
            </span>
          </div>
        </div>

        {/* Global Search */}
        <div className="hidden md:flex flex-1 max-w-md mx-8">
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search your files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* Action Controls & Profile Menu */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-slate-950 text-xs font-bold hover:from-cyan-500 hover:to-emerald-500 transition-all glow-cyan"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload File</span>
          </button>

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserDropdown(!userDropdown)}
              className="flex items-center space-x-2.5 p-1.5 rounded-xl glass-card border border-slate-800 hover:border-slate-700 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-emerald-600 text-slate-950 font-bold text-xs flex items-center justify-center">
                {user?.name ? user.name.slice(0, 2).toUpperCase() : 'US'}
              </div>
              <span className="text-xs font-semibold text-slate-200 hidden sm:inline">{user?.name || 'User'}</span>
            </button>

            {userDropdown && (
              <div className="absolute right-0 mt-2 w-56 glass-panel rounded-2xl p-2 shadow-2xl border border-slate-800 space-y-1 z-50">
                <div className="p-3 border-b border-slate-800/80">
                  <p className="text-xs font-bold text-slate-100">{user?.name || 'User'}</p>
                  <p className="text-[11px] text-slate-400 font-mono truncate">{user?.email || 'user@vault.io'}</p>
                  <span className="mt-1 inline-block text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono uppercase">
                    Storage Member
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-slate-800/60 rounded-xl flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Drive Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Storage Quota Progress Card */}
        <div className="glass-panel p-6 rounded-3xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 flex-1">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                Personal Cloud Storage Quota
              </span>
              <span className="text-cyan-300 font-bold">{totalMB} MB of {quotaLimitMB} MB used</span>
            </div>

            <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden p-0.5 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400 rounded-full transition-all duration-500 glow-cyan"
                style={{ width: `${Math.max(2, usedPercentage)}%` }}
              ></div>
            </div>

            <div className="flex justify-between text-[11px] text-slate-500 font-mono">
              <span>{objects.length} Files Uploaded</span>
              <span>Protected by N=3 Multi-Node Replication</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-950/40 px-4 py-2.5 rounded-2xl border border-emerald-800/60">
            <ShieldCheck className="w-4 h-4" />
            <span>SHA-256 Bit-Rot Protection Active</span>
          </div>
        </div>

        {/* Filter & View Mode Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center space-x-2 text-xs font-mono">
            {['ALL', 'DOCS', 'IMAGES'].map((type) => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-xl border transition-all ${
                  filterType === type
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-500/50 font-bold shadow-sm'
                    : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200'
                }`}
              >
                {type === 'ALL' ? 'All Files' : type === 'DOCS' ? 'Documents' : 'Images'}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-lg ${viewMode === 'list' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500'}`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg ${viewMode === 'grid' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* User Files Display */}
        {loading ? (
          <div className="glass-panel p-16 rounded-3xl border border-slate-800 text-center text-slate-500 font-mono">
            Loading your files...
          </div>
        ) : filteredObjects.length === 0 ? (
          <div className="glass-panel p-16 rounded-3xl border border-slate-800 text-center space-y-4">
            <div className="inline-flex p-4 rounded-full bg-slate-900 text-cyan-400 border border-slate-800 glow-cyan">
              <UploadCloud className="w-10 h-10" />
            </div>
            <h3 className="text-lg font-bold text-slate-200">No Files Uploaded Yet</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Drag and drop files here or click Upload to safely store your documents across the Vault cluster.
            </p>
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-slate-950 font-bold text-xs hover:from-cyan-500 hover:to-emerald-500 transition-all glow-cyan"
            >
              Upload First File
            </button>
          </div>
        ) : viewMode === 'list' ? (
          <div className="glass-panel rounded-3xl overflow-hidden border border-slate-800">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-900/80 text-slate-400 uppercase font-mono text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-4 px-6">File Name</th>
                  <th className="py-4 px-4">Size</th>
                  <th className="py-4 px-4">Version</th>
                  <th className="py-4 px-4">Protection</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredObjects.map((file) => {
                  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
                  return (
                    <tr key={file.object_name} className="hover:bg-slate-900/40 transition-colors">
                      <td className="py-4 px-6 font-semibold text-slate-100 flex items-center space-x-3">
                        {getFileIcon(file.object_name)}
                        <span className="truncate max-w-md font-mono">{file.object_name}</span>
                      </td>
                      <td className="py-4 px-4 font-mono text-slate-400">{sizeMB} MB</td>
                      <td className="py-4 px-4">
                        <span className="px-2.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono text-[11px]">
                          v{file.version}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Replicated (N=3)
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right space-x-2">
                        <button
                          onClick={() => handleCopyShareLink(file.object_name)}
                          className="p-2 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-slate-800/60 transition-colors"
                          title="Share Download Link"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <a
                          href={downloadObjectUrl(file.object_name)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-block p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800/60 transition-colors"
                          title="Download File"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(file.object_name)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 transition-colors"
                          title="Delete File"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredObjects.map((file) => {
              const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
              return (
                <div
                  key={file.object_name}
                  className="glass-panel p-5 rounded-3xl border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-4 glow-cyan"
                >
                  <div className="flex items-start justify-between">
                    <div className="p-3 rounded-2xl bg-slate-900 border border-slate-800">
                      {getFileIcon(file.object_name)}
                    </div>
                    <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono text-[10px]">
                      v{file.version}
                    </span>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-100 truncate text-sm font-mono">{file.object_name}</h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{sizeMB} MB</p>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <button
                      onClick={() => handleCopyShareLink(file.object_name)}
                      className="text-slate-400 hover:text-cyan-400"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <a
                      href={downloadObjectUrl(file.object_name)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:underline font-semibold flex items-center gap-1"
                    >
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={fetchUserFiles}
      />
    </div>
  );
}
