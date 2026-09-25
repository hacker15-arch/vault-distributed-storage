import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, X, File, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { uploadObject } from '../../api/objects';

export default function UploadModal({ isOpen, onClose, onUploadSuccess }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [customKey, setCustomKey] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState('idle'); // idle | uploading | replicating | verifying | completed | error
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      if (!customKey) setCustomKey(file.name);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      if (!customKey) setCustomKey(file.name);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const objectName = customKey.trim() || selectedFile.name;

    try {
      setUploading(true);
      setUploadStage('uploading');
      setErrorMessage('');

      await uploadObject(objectName, selectedFile, (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || selectedFile.size || 1));
        setProgress(percent);
        if (percent >= 70 && percent < 90) setUploadStage('replicating');
        if (percent >= 90) setUploadStage('verifying');
      });

      setUploadStage('completed');
      setTimeout(() => {
        if (onUploadSuccess) onUploadSuccess();
        onClose();
        resetForm();
      }, 1200);
    } catch (err) {
      setUploadStage('error');
      setErrorMessage(err.message || 'Failed to upload object payload.');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setCustomKey('');
    setProgress(0);
    setUploadStage('idle');
    setErrorMessage('');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="glass-panel w-full max-w-lg p-6 rounded-2xl border border-slate-800 shadow-2xl space-y-6 relative"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-cyan-400" />
              Upload Object to Vault Cluster
            </h3>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
              dragActive
                ? 'border-cyan-400 bg-cyan-950/40 glow-cyan'
                : selectedFile
                ? 'border-emerald-500/50 bg-emerald-950/20'
                : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
            }`}
          >
            {selectedFile ? (
              <div className="flex flex-col items-center space-y-2">
                <div className="p-3 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  <File className="w-8 h-8" />
                </div>
                <span className="text-sm font-semibold text-slate-200">{selectedFile.name}</span>
                <span className="text-xs text-slate-500 font-mono">
                  {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Binary'}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-xs text-rose-400 hover:underline pt-1"
                >
                  Change File
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-3">
                <div className="p-4 rounded-full bg-slate-900 text-cyan-400 border border-slate-800 glow-cyan">
                  <UploadCloud className="w-8 h-8 animate-bounce" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">
                    Drop your files here, or{' '}
                    <label className="text-cyan-400 hover:underline cursor-pointer">
                      browse files
                      <input type="file" onChange={handleFileChange} className="hidden" />
                    </label>
                  </p>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    Replicated across N=3 storage nodes with SHA-256 validation
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Custom Object Key Input */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Object Key Path (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. docs/reports/annual_2026.pdf"
              value={customKey}
              onChange={(e) => setCustomKey(e.target.value)}
              className="w-full px-4 py-2 text-sm bg-slate-900/60 border border-slate-800 rounded-xl text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {/* Upload Progress Indicator */}
          {uploading && (
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-cyan-400 flex items-center gap-1.5 capitalize">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {uploadStage}...
                </span>
                <span className="text-slate-400">{progress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          {/* Success / Error Banners */}
          {uploadStage === 'completed' && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Object stored and replicated across write quorum nodes!</span>
            </div>
          )}

          {uploadStage === 'error' && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-2">
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-cyan-600 to-emerald-600 text-slate-950 hover:from-cyan-500 hover:to-emerald-500 disabled:opacity-50 transition-all glow-cyan"
            >
              {uploading ? 'Storing Payload...' : 'Upload & Replicate'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
