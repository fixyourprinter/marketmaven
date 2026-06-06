import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Users, ShieldAlert, ShieldCheck, MessageSquare, ClipboardList, 
  DollarSign, Calendar, RefreshCw, Check, Star, Trash2,
  Cpu, HardDrive, Network, Wifi, Activity, Server, Clock, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = '/api';

interface UserStat {
  id: number;
  username: string;
  role: 'admin' | 'user';
  created_at: string;
  totalItems: number;
  drafts: number;
  listed: number;
  sold: number;
  totalSpend: number;
  locationsCount: number;
  feedbackCount: number;
}

interface FeedbackItem {
  id: number;
  message: string;
  rating: number | null;
  status: 'pending' | 'resolved';
  created_at: string;
  username: string;
}

interface TelemetryStats {
  ollama: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalPromptTokens: number;
    totalEvalTokens: number;
    totalDurationMs: number;
    averageLatencyMs: number;
    recentRequests: Array<{
      timestamp: string;
      model: string;
      action: string;
      promptTokens: number;
      evalTokens: number;
      durationMs: number;
      success: boolean;
    }>;
  };
  network: {
    totalRequests: number;
    totalBytesSent: number;
    totalBytesReceived: number;
    requestsPerSecond: number;
  };
  activeSessions: Array<{
    userId: number;
    username: string;
    role: string;
    ip: string;
    lastActivePath: string;
    lastActiveTime: string;
    idleMs: number;
    isOnline: boolean;
  }>;
  system: {
    cpu: {
      model: string;
      cores: number;
    };
    memory: {
      totalBytes: number;
      freeBytes: number;
      usedBytes: number;
      usagePercent: number;
    };
    os: {
      platform: string;
      release: string;
      arch: string;
      uptime: number;
    };
    process: {
      version: string;
      uptime: number;
      memoryUsage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
      };
    };
  };
}

// Telemetry Formatting Helpers
const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number) => {
  if (!seconds || seconds <= 0) return '0s';
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (parts.length === 0 || s > 0) parts.push(`${s}s`);
  
  return parts.join(' ');
};

const formatIdleTime = (ms: number) => {
  if (ms < 10000) return 'Active now';
  if (ms < 60000) return 'Active < 1m ago';
  const m = Math.floor(ms / 60000);
  if (m < 60) return `Idle ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Idle ${h}h ago`;
  return `Idle ${Math.floor(h / 24)}d ago`;
};

const AdminDashboard: React.FC = () => {
  const [users, setUsers] = useState<UserStat[]>([]);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'feedback' | 'telemetry'>('users');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Telemetry Dashboard states
  const [telemetry, setTelemetry] = useState<TelemetryStats | null>(null);
  const [telemetryLoading, setTelemetryLoading] = useState(false);

  // Auth & Settings states
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [disableSelfSignup, setDisableSelfSignup] = useState<boolean>(false);

  // Add User modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');
  const [modalLoading, setModalLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Delete confirmation modal states
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmUsername, setDeleteConfirmUsername] = useState<string>('');

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [usersRes, feedbackRes, meRes, signupRes] = await Promise.all([
        axios.get(`${API_BASE}/admin/activity`),
        axios.get(`${API_BASE}/admin/feedback`),
        axios.get(`${API_BASE}/auth/me`),
        axios.get(`${API_BASE}/admin/settings/self-signup`)
      ]);
      setUsers(usersRes.data);
      setFeedback(feedbackRes.data);
      setCurrentUserId(meRes.data.user.id);
      setDisableSelfSignup(signupRes.data.disableSelfSignup);
    } catch (err) {
      console.error('Failed to fetch admin dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTelemetry = async () => {
    try {
      const res = await axios.get(`${API_BASE}/admin/telemetry`);
      setTelemetry(res.data);
    } catch (err) {
      console.error('Failed to fetch telemetry details', err);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  // Telemetry Polling Effect
  useEffect(() => {
    if (activeSubTab !== 'telemetry') return;

    setTelemetryLoading(true);
    fetchTelemetry().finally(() => setTelemetryLoading(false));

    const interval = setInterval(fetchTelemetry, 5000);
    return () => clearInterval(interval);
  }, [activeSubTab]);

  const handleToggleRole = async (userId: number, currentRole: 'admin' | 'user') => {
    setActionLoading(userId);
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await axios.put(`${API_BASE}/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      alert('Failed to update user role');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveFeedback = async (feedbackId: number) => {
    setActionLoading(feedbackId);
    try {
      await axios.post(`${API_BASE}/admin/feedback/${feedbackId}/resolve`);
      setFeedback(prev => prev.map(f => f.id === feedbackId ? { ...f, status: 'resolved' } : f));
    } catch (err) {
      alert('Failed to resolve feedback');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleSelfSignup = async () => {
    const nextVal = !disableSelfSignup;
    try {
      await axios.post(`${API_BASE}/admin/settings/self-signup`, { disableSelfSignup: nextVal });
      setDisableSelfSignup(nextVal);
    } catch (err) {
      alert('Failed to update self-signup configuration');
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) {
      setErrorMsg('Username and password are required');
      return;
    }
    setModalLoading(true);
    setErrorMsg('');
    try {
      await axios.post(`${API_BASE}/admin/users`, {
        username: newUsername,
        password: newPassword,
        role: newRole
      });
      setIsAddModalOpen(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('user');
      
      // Refresh directory
      const usersRes = await axios.get(`${API_BASE}/admin/activity`);
      setUsers(usersRes.data);
    } catch (err: any) {
      const serverErr = err.response?.data?.error || 'Failed to create user';
      setErrorMsg(serverErr);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (deleteConfirmId === null) return;
    setActionLoading(deleteConfirmId);
    try {
      await axios.delete(`${API_BASE}/admin/users/${deleteConfirmId}`);
      setUsers(prev => prev.filter(u => u.id !== deleteConfirmId));
      
      // Re-fetch feedback list in case items were deleted
      const feedbackRes = await axios.get(`${API_BASE}/admin/feedback`);
      setFeedback(feedbackRes.data);
    } catch (err) {
      alert('Failed to delete user and associated data');
    } finally {
      setActionLoading(null);
      setDeleteConfirmId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-400 gap-4">
        <RefreshCw className="animate-spin text-blue-500" size={36} />
        <p className="font-serif text-lg italic animate-pulse">Aggregating test user telemetry & feedbacks...</p>
      </div>
    );
  }

  // Aggregate stats for KPI cards
  const totalUsers = users.length;
  const totalSourcedItems = users.reduce((sum, u) => sum + u.totalItems, 0);
  const totalTesterSpend = users.reduce((sum, u) => sum + u.totalSpend, 0);
  const pendingFeedback = feedback.filter(f => f.status === 'pending').length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/5 pb-4 gap-4">
        <div>
          <h2 className="font-serif text-2xl font-black text-slate-100 flex items-center gap-2.5">
            <ShieldAlert className="text-blue-500" size={24} />
            Admin Control Center
          </h2>
          <p className="text-[11px] text-slate-500 font-sans mt-1">Monitor test user activity, promote administrative roles, and resolve app feedback</p>
        </div>

        {/* Tab Selection */}
        <div className="bg-slate-950/40 p-1 rounded-xl border border-white/5 flex self-start">
          <button 
            onClick={() => setActiveSubTab('users')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-450 hover:text-slate-200'
            }`}
          >
            <Users size={14} />
            Testers Directory ({totalUsers})
          </button>
          <button 
            onClick={() => setActiveSubTab('feedback')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'feedback' ? 'bg-blue-600 text-white' : 'text-slate-450 hover:text-slate-200'
            }`}
          >
            <MessageSquare size={14} />
            Feedback Tickets ({pendingFeedback} pending)
          </button>
          <button 
            onClick={() => setActiveSubTab('telemetry')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'telemetry' ? 'bg-blue-600 text-white' : 'text-slate-450 hover:text-slate-200'
            }`}
          >
            <span className="relative flex h-1.5 w-1.5 mr-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <Activity size={14} />
            System Telemetry
          </button>
        </div>
      </div>

      {/* Global settings and actions */}
      <div className="glass-card p-5 border border-white/5 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-6 w-full sm:w-auto">
          {/* Toggle Self-Signup */}
          <div className="flex items-center justify-between w-full sm:w-auto gap-4">
            <div>
              <p className="text-xs font-bold text-slate-200">Disable Public Self-Signup</p>
              <p className="text-[10px] text-slate-500 font-sans">Prevent public registration of new test users</p>
            </div>
            <button
              onClick={handleToggleSelfSignup}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                disableSelfSignup ? 'bg-blue-600' : 'bg-slate-800'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  disableSelfSignup ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Add User Button */}
        <button
          onClick={() => {
            setErrorMsg('');
            setIsAddModalOpen(true);
          }}
          className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-500/10 active:scale-95"
        >
          <Users size={14} />
          Add New Tester
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Testers */}
        <div className="glass-card p-5 relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
            <Users size={90} className="text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Registered Testers</p>
          <h3 className="text-2xl font-bold font-mono text-slate-100">{totalUsers}</h3>
          <span className="text-[10px] text-blue-400 font-semibold block mt-2 font-sans">
            Active external testers
          </span>
        </div>

        {/* Total Sourced Items */}
        <div className="glass-card p-5 relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
            <ClipboardList size={90} className="text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Items Sourced</p>
          <h3 className="text-2xl font-bold font-mono text-slate-100">{totalSourcedItems}</h3>
          <span className="text-[10px] text-slate-500 block mt-2 font-sans">
            Across all test accounts
          </span>
        </div>

        {/* Total Tester Spend */}
        <div className="glass-card p-5 relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
            <DollarSign size={90} className="text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Sourcing Capital</p>
          <h3 className="text-2xl font-bold font-mono text-slate-100">${totalTesterSpend.toFixed(2)}</h3>
          <span className="text-[10px] text-slate-500 block mt-2 font-sans">
            Acquisition costs recorded
          </span>
        </div>

        {/* Pending Feedback tickets */}
        <div className="glass-card p-5 relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
            <MessageSquare size={90} className="text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Unresolved Feedback</p>
          <h3 className={`text-2xl font-bold font-mono ${pendingFeedback > 0 ? 'text-amber-400' : 'text-slate-100'}`}>
            {pendingFeedback}
          </h3>
          <span className="text-[10px] text-slate-500 block mt-2 font-sans">
            Awaiting administrator review
          </span>
        </div>
      </div>

      {/* Main View Area */}
      {activeSubTab === 'users' ? (
        /* TAB 1: USERS DIRECTORY */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {users.map(u => (
            <div 
              key={u.id} 
              className={`glass-card p-5 border flex flex-col justify-between gap-6 hover:border-slate-800 transition-all text-left ${
                u.role === 'admin' ? 'border-blue-500/20 bg-blue-500/[0.005]' : 'border-white/5'
              }`}
            >
              <div className="space-y-4">
                {/* Header info */}
                <div className="flex items-start justify-between min-w-0">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-200 truncate">{u.username}</span>
                      <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border ${
                        u.role === 'admin' 
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                          : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 font-mono flex items-center gap-0.5">
                      <Calendar size={10} />
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Stats Table */}
                <div className="pt-2 border-t border-white/5 space-y-2 text-xs font-sans">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total Items Sourced</span>
                    <span className="font-bold text-slate-350">{u.totalItems}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pl-3">
                    <span className="text-slate-500">Drafts / Active / Sold</span>
                    <span className="text-slate-400 font-medium">
                      {u.drafts} / {u.listed} / <span className="text-green-400 font-bold">{u.sold}</span>
                    </span>
                  </div>
                  <div className="flex justify-between pt-1">
                    <span className="text-slate-500">Sourcing Locations</span>
                    <span className="font-bold text-slate-350">{u.locationsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Sourcing Spend</span>
                    <span className="font-bold text-slate-350">${u.totalSpend.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Feedback Submitted</span>
                    <span className="font-bold text-slate-350">{u.feedbackCount}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-white/5 flex justify-between items-center gap-2">
                {u.id !== currentUserId ? (
                  <button
                    onClick={() => {
                      setDeleteConfirmId(u.id);
                      setDeleteConfirmUsername(u.username);
                    }}
                    disabled={actionLoading === u.id}
                    className="p-1.5 bg-slate-900/60 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/30 text-slate-450 hover:text-rose-400 disabled:opacity-40 rounded-lg transition-all cursor-pointer flex items-center justify-center shrink-0"
                    title="Delete Tester & All Data"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <span className="text-[9px] text-slate-550 font-mono italic">Current Session</span>
                )}

                <button
                  onClick={() => handleToggleRole(u.id, u.role)}
                  disabled={actionLoading === u.id}
                  className="px-3 py-1.5 bg-slate-900 border border-white/10 hover:bg-slate-800 disabled:opacity-40 text-slate-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 ml-auto"
                >
                  {actionLoading === u.id ? (
                    <RefreshCw className="animate-spin" size={10} />
                  ) : u.role === 'admin' ? (
                    <>
                      <ShieldCheck size={10} />
                      Demote to User
                    </>
                  ) : (
                    <>
                      <ShieldAlert size={10} />
                      Promote to Admin
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : activeSubTab === 'feedback' ? (
        /* TAB 2: FEEDBACK TICKETS */
        <div className="space-y-4 max-w-4xl">
          {feedback.length === 0 ? (
            <div className="text-center py-12 text-slate-500 glass-card">
              <MessageSquare className="mx-auto mb-2 opacity-20" size={32} />
              <p className="text-xs">No feedback submitted by test users yet.</p>
            </div>
          ) : (
            feedback.map(f => (
              <div 
                key={f.id} 
                className={`glass-card p-5 border flex flex-col md:flex-row md:items-start justify-between gap-6 hover:border-slate-800 transition-all text-left ${
                  f.status === 'resolved' ? 'border-white/5 bg-slate-950/10 opacity-60' : 'border-amber-500/10 bg-amber-500/[0.005]'
                }`}
              >
                {/* Text Context */}
                <div className="space-y-2.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-xs text-slate-200">{f.username}</span>
                    <span className="text-[9px] text-slate-500 font-mono">
                      {new Date(f.created_at).toLocaleString()}
                    </span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border ${
                      f.status === 'resolved' 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                    }`}>
                      {f.status}
                    </span>
                  </div>

                  {/* Rating Stars */}
                  {f.rating && (
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star 
                          key={star} 
                          size={11} 
                          className={star <= f.rating! ? "text-amber-400 fill-amber-400" : "text-slate-700"} 
                        />
                      ))}
                    </div>
                  )}

                  <p className="text-xs text-slate-350 leading-relaxed font-sans">"{f.message}"</p>
                </div>

                {/* Resolve Action */}
                {f.status === 'pending' && (
                  <button
                    onClick={() => handleResolveFeedback(f.id)}
                    disabled={actionLoading === f.id}
                    className="self-start md:self-center px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 active:scale-95 cursor-pointer shadow-lg shadow-blue-500/10"
                  >
                    {actionLoading === f.id ? (
                      <RefreshCw className="animate-spin" size={10} />
                    ) : (
                      <>
                        <Check size={11} />
                        Resolve Ticket
                      </>
                    )}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* TAB 3: SYSTEM TELEMETRY */
        <div className="space-y-8">
          {telemetryLoading && !telemetry ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-4">
              <RefreshCw className="animate-spin text-blue-500" size={32} />
              <p className="font-serif text-sm italic animate-pulse">Aggregating live system and model telemetry...</p>
            </div>
          ) : !telemetry ? (
            <div className="text-center py-12 text-slate-500 glass-card">
              <ShieldAlert className="mx-auto mb-2 opacity-20" size={32} />
              <p className="text-xs">No telemetry data loaded yet.</p>
            </div>
          ) : (
            <>
              {/* Telemetry KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Total AI Requests */}
                <div className="glass-card p-5 relative overflow-hidden group">
                  <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
                    <Activity size={90} className="text-blue-500" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total AI Requests</p>
                  <h3 className="text-2xl font-bold font-mono text-slate-100">
                    {telemetry.ollama.totalRequests}
                  </h3>
                  <span className="text-[10px] text-emerald-400 font-semibold block mt-2 font-sans">
                    Success rate: {telemetry.ollama.totalRequests > 0 
                      ? Math.round((telemetry.ollama.successfulRequests / telemetry.ollama.totalRequests) * 100)
                      : 100}%
                  </span>
                </div>

                {/* Avg Latency */}
                <div className="glass-card p-5 relative overflow-hidden group">
                  <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
                    <Clock size={90} className="text-blue-500" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Avg AI Latency</p>
                  <h3 className="text-2xl font-bold font-mono text-slate-100">
                    {telemetry.ollama.averageLatencyMs >= 1000 
                      ? `${(telemetry.ollama.averageLatencyMs / 1000).toFixed(2)}s`
                      : `${telemetry.ollama.averageLatencyMs}ms`}
                  </h3>
                  <span className="text-[10px] text-slate-500 block mt-2 font-sans">
                    Local inference duration
                  </span>
                </div>

                {/* Network RPS */}
                <div className="glass-card p-5 relative overflow-hidden group">
                  <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
                    <Network size={90} className="text-blue-500" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Network Load (RPS)</p>
                  <h3 className="text-2xl font-bold font-mono text-slate-100">
                    {telemetry.network.requestsPerSecond} req/s
                  </h3>
                  <span className="text-[10px] text-slate-500 block mt-2 font-sans">
                    Rolling 10s request rate
                  </span>
                </div>

                {/* Active Testers */}
                <div className="glass-card p-5 relative overflow-hidden group">
                  <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
                    <Wifi size={90} className="text-blue-500" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Online Sessions</p>
                  <h3 className="text-2xl font-bold font-mono text-slate-100">
                    {telemetry.activeSessions.filter(s => s.isOnline).length}
                  </h3>
                  <span className="text-[10px] text-blue-400 font-semibold block mt-2 font-sans">
                    {telemetry.activeSessions.length} total active recently
                  </span>
                </div>
              </div>

              {/* Main Telemetry Panels */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Area (2 Cols): Ollama Details & Sessions */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Ollama Stats Panel */}
                  <div className="glass-card p-5 space-y-4 text-left">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Database className="text-blue-500" size={16} />
                      Ollama Local LLM Statistics
                    </h3>
                    <div className="grid grid-cols-3 gap-4 pt-2 border-t border-white/5 text-xs font-sans">
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Prompt Tokens</p>
                        <p className="text-base font-bold text-slate-300 font-mono mt-1">
                          {telemetry.ollama.totalPromptTokens.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Generated Tokens</p>
                        <p className="text-base font-bold text-slate-300 font-mono mt-1">
                          {telemetry.ollama.totalEvalTokens.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Inference Model</p>
                        <p className="text-xs font-bold text-blue-400 font-mono mt-1.5 truncate">
                          llava (16k ctx)
                        </p>
                      </div>
                    </div>

                    {/* Recent AI Operations */}
                    <div className="pt-4 border-t border-white/5 space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Recent AI Operations Log</p>
                      {telemetry.ollama.recentRequests.length === 0 ? (
                        <p className="text-xs text-slate-500 py-3 italic">No LLM requests recorded yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] font-sans border-collapse">
                            <thead>
                              <tr className="border-b border-white/5 text-slate-500 text-left">
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px] w-[20%]">Time</th>
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px] w-[30%]">Operation</th>
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px] w-[25%]">Tokens (P/G)</th>
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px] w-[15%]">Latency</th>
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px] w-[10%] text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {telemetry.ollama.recentRequests.map((req, idx) => (
                                <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-slate-900/20">
                                  <td className="py-2 text-slate-400 font-mono">
                                    {new Date(req.timestamp).toLocaleTimeString()}
                                  </td>
                                  <td className="py-2 font-bold text-slate-200">
                                    {req.action}
                                  </td>
                                  <td className="py-2 text-slate-400 font-mono">
                                    {req.promptTokens} / {req.evalTokens}
                                  </td>
                                  <td className="py-2 text-slate-350 font-mono">
                                    {req.durationMs >= 1000 
                                      ? `${(req.durationMs / 1000).toFixed(1)}s`
                                      : `${req.durationMs}ms`}
                                  </td>
                                  <td className="py-2 text-right">
                                    <span className={`inline-block text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                      req.success 
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}>
                                      {req.success ? 'Success' : 'Error'}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Active Sessions Panel */}
                  <div className="glass-card p-5 space-y-4 text-left">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Users className="text-blue-500" size={16} />
                      Online Testers Directory
                    </h3>
                    <div className="border-t border-white/5 pt-2">
                      {telemetry.activeSessions.length === 0 ? (
                        <p className="text-xs text-slate-500 py-3 italic">No connected tester sessions found.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] font-sans border-collapse">
                            <thead>
                              <tr className="border-b border-white/5 text-slate-500 text-left">
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px]">Tester</th>
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px]">IP Address</th>
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px]">Last Active Endpoint</th>
                                <th className="pb-1.5 font-bold uppercase tracking-wider text-[9px] text-right">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {telemetry.activeSessions.map((session, idx) => (
                                <tr key={idx} className="border-b border-white/5 last:border-0 hover:bg-slate-900/20">
                                  <td className="py-2 text-slate-200 font-bold flex items-center gap-2">
                                    <span>{session.username}</span>
                                    <span className={`text-[8px] px-1 py-0.2 rounded font-black uppercase tracking-wider border ${
                                      session.role === 'admin' 
                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                    }`}>
                                      {session.role}
                                    </span>
                                  </td>
                                  <td className="py-2 text-slate-400 font-mono">
                                    {session.ip === '::1' || session.ip === '::ffff:127.0.0.1' ? '127.0.0.1 (Localhost)' : session.ip}
                                  </td>
                                  <td className="py-2 text-slate-400 font-mono truncate max-w-[200px]" title={session.lastActivePath}>
                                    {session.lastActivePath}
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="inline-flex items-center gap-1.5">
                                      <span className={`h-1.5 w-1.5 rounded-full ${
                                        session.isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                                      }`}></span>
                                      <span className={`text-[9px] font-bold ${session.isOnline ? 'text-emerald-400' : 'text-amber-500'}`}>
                                        {formatIdleTime(session.idleMs)}
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Area (1 Col): Hardware, Node, Bandwidth */}
                <div className="space-y-6">
                  {/* System Hardware Panel */}
                  <div className="glass-card p-5 space-y-4 text-left">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Cpu className="text-blue-500" size={16} />
                      Hardware Resources
                    </h3>
                    <div className="border-t border-white/5 pt-3 space-y-4 text-xs font-sans">
                      {/* CPU */}
                      <div className="space-y-1">
                        <p className="text-slate-500 text-[10px] uppercase font-bold tracking-wider flex items-center gap-1">
                          <Cpu size={10} /> CPU Processor
                        </p>
                        <p className="font-bold text-slate-200 truncate">{telemetry.system.cpu.model}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{telemetry.system.cpu.cores} Cores / Threads</p>
                      </div>

                      {/* Memory RAM */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          <span className="flex items-center gap-1"><HardDrive size={10} /> Physical RAM Usage</span>
                          <span className="font-mono text-slate-350">{telemetry.system.memory.usagePercent}%</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden border border-white/5">
                          <div 
                            className="bg-gradient-to-r from-blue-500 via-cyan-400 to-indigo-500 h-full rounded-full transition-all duration-1000"
                            style={{ width: `${telemetry.system.memory.usagePercent}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 font-mono">
                          <span>Used: {formatBytes(telemetry.system.memory.usedBytes)}</span>
                          <span>Free: {formatBytes(telemetry.system.memory.freeBytes)}</span>
                        </div>
                      </div>

                      {/* Operating System */}
                      <div className="pt-2 border-t border-white/5 space-y-2 text-[11px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Host OS Platform</span>
                          <span className="font-bold text-slate-300 font-mono uppercase">
                            {telemetry.system.os.platform} ({telemetry.system.os.arch})
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">OS Release</span>
                          <span className="font-bold text-slate-400 font-mono">{telemetry.system.os.release}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">System Uptime</span>
                          <span className="font-bold text-slate-300 font-mono">{formatUptime(telemetry.system.os.uptime)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Node.js Process Panel */}
                  <div className="glass-card p-5 space-y-4 text-left">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Database className="text-blue-500" size={16} />
                      Node.js Core Stats
                    </h3>
                    <div className="border-t border-white/5 pt-3 space-y-3 text-[11px] font-sans">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Node.js Version</span>
                        <span className="font-bold text-slate-300 font-mono">{telemetry.system.process.version}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Process Uptime</span>
                        <span className="font-bold text-slate-300 font-mono">{formatUptime(telemetry.system.process.uptime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Heap Used</span>
                        <span className="font-bold text-slate-300 font-mono">{formatBytes(telemetry.system.process.memoryUsage.heapUsed)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Heap Total Allocated</span>
                        <span className="font-bold text-slate-400 font-mono">{formatBytes(telemetry.system.process.memoryUsage.heapTotal)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Resident Set (RSS)</span>
                        <span className="font-bold text-slate-400 font-mono">{formatBytes(telemetry.system.process.memoryUsage.rss)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Network Traffic Panel */}
                  <div className="glass-card p-5 space-y-4 text-left">
                    <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                      <Server className="text-blue-500" size={16} />
                      Bandwidth Traffic
                    </h3>
                    <div className="border-t border-white/5 pt-3 space-y-3 text-[11px] font-sans">
                      <div className="flex justify-between">
                        <span className="text-slate-500">HTTP Requests Handled</span>
                        <span className="font-bold text-slate-300 font-mono">
                          {telemetry.network.totalRequests.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Bytes Received</span>
                        <span className="font-bold text-emerald-400 font-mono">
                          {formatBytes(telemetry.network.totalBytesReceived)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Bytes Sent</span>
                        <span className="font-bold text-blue-400 font-mono">
                          {formatBytes(telemetry.network.totalBytesSent)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </>
          )}
        </div>
      )}

      {/* Overlay Modal: Add New Tester */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAddModalOpen(false);
                setErrorMsg('');
              }}
              className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            />
            
            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card w-full max-w-md p-6 border border-white/5 relative z-10 space-y-6 shadow-2xl"
            >
              <div className="flex justify-between items-start">
                <div className="text-left">
                  <h3 className="font-serif text-lg font-bold text-slate-100 flex items-center gap-2">
                    <Users className="text-blue-500" size={20} />
                    Add New Tester
                  </h3>
                  <p className="text-[10px] text-slate-500 font-sans mt-0.5">
                    Create a new tester profile. Standard users cannot access this dashboard.
                  </p>
                </div>
              </div>

              <form onSubmit={handleAddUser} className="space-y-4 text-left">
                {errorMsg && (
                  <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg">
                    {errorMsg}
                  </div>
                )}
                
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-550">Username</label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    className="w-full bg-slate-950/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                    placeholder="e.g. tester123"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-550">Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                    placeholder="••••••••"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-555 text-slate-550">Role</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as 'user' | 'admin')}
                    className="w-full bg-slate-950/40 border border-white/5 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 transition-colors"
                  >
                    <option value="user" className="bg-slate-950 text-slate-200">Standard User</option>
                    <option value="admin" className="bg-slate-950 text-slate-200">Administrator</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-white/5 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setErrorMsg('');
                    }}
                    className="px-3.5 py-2 border border-white/10 hover:bg-slate-900 text-slate-350 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalLoading}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-500/10 active:scale-95"
                  >
                    {modalLoading ? (
                      <RefreshCw className="animate-spin" size={12} />
                    ) : (
                      'Create Account'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Overlay Modal: Delete user confirmation */}
      <AnimatePresence>
        {deleteConfirmId !== null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmId(null)}
              className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm"
            />
            
            {/* Modal Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="glass-card w-full max-w-md p-6 border border-rose-500/20 relative z-10 space-y-6 shadow-2xl text-left"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500 shrink-0">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <h3 className="font-serif text-base font-bold text-slate-100">
                    Delete Tester Account?
                  </h3>
                  <p className="text-[11px] text-slate-400 font-sans mt-0.5 leading-relaxed">
                    Are you absolutely sure you want to delete <strong className="text-slate-200">"{deleteConfirmUsername}"</strong>?
                  </p>
                </div>
              </div>

              <div className="bg-rose-500/[0.03] border border-rose-500/15 p-3 rounded-lg text-[10px] text-slate-400 font-sans leading-relaxed">
                <strong className="text-rose-400 font-bold block mb-1">⚠️ CRITICAL WARNING:</strong>
                This action will permanently delete this user account and cascade-delete all their associated data, including:
                <ul className="list-disc list-inside mt-1 space-y-0.5 pl-1">
                  <li>All items (drafts, listings, sales)</li>
                  <li>All saved sourcing route locations</li>
                  <li>All submitted app feedback tickets</li>
                  <li>User settings & cached eBay listing data</li>
                </ul>
                This action is atomic and cannot be undone.
              </div>

              <div className="pt-4 border-t border-white/5 flex justify-end gap-3 font-sans">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-3.5 py-2 border border-white/10 hover:bg-slate-900 text-slate-350 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteUser}
                  disabled={actionLoading === deleteConfirmId}
                  className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-lg shadow-rose-500/10 active:scale-95"
                >
                  {actionLoading === deleteConfirmId ? (
                    <RefreshCw className="animate-spin" size={12} />
                  ) : (
                    'Delete Forever'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminDashboard;
