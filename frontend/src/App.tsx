import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { LayoutDashboard, Database, Settings as SettingsIcon, ChevronRight, X, Sun, Moon, Menu, Camera, MessageSquare, History, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './pages/Dashboard';
import EbayInventory from './pages/EbayInventory';

import MobileCapture from './pages/MobileCapture';

const API_BASE = '/api';

interface SidebarProps {
  onOpenSettings: () => void;
  onOpenFeedback: () => void;
  onOpenVersionNotes: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onOpenSettings, onOpenFeedback, onOpenVersionNotes }) => {
  const location = useLocation();
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/ebay', label: 'eBay Inventory', icon: Database },
  ];

  const handleEbayLogin = async () => {
    try {
      const response = await axios.get(`${API_BASE}/ebay/login`);
      window.open(response.data.url, '_blank', 'width=600,height=800');
    } catch (error) {
      alert('Failed to get eBay login URL');
    }
  };

  return (
    <aside className="w-72 h-screen fixed left-0 top-0 bg-slate-950 border-r border-slate-900 flex flex-col p-6 z-50">
      <div className="flex flex-col mb-10 px-2">
        <span className="font-serif font-black text-2.5xl tracking-tight text-white leading-none">Market<span className="text-blue-500 font-sans font-light">Maven</span></span>
        <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-1">smart resell assistant</span>
      </div>

      <nav className="flex-1 space-y-2">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
              location.pathname === item.path 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <item.icon size={20} />
            <span className="font-medium">{item.label}</span>
            {location.pathname === item.path && <ChevronRight className="ml-auto" size={16} />}
          </Link>
        ))}
      </nav>

      <div className="mt-auto pt-6 border-t border-slate-900 space-y-3">
        <button 
          onClick={handleEbayLogin}
          className="w-full btn-primary py-3 flex items-center justify-center gap-2 group text-sm cursor-pointer mb-2"
        >
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
          Connect eBay
        </button>
        <button 
          onClick={onOpenFeedback}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-all cursor-pointer text-sm font-medium"
        >
          <MessageSquare size={18} className="text-blue-500" />
          <span>Wife's Feedback Box</span>
        </button>
        <button 
          onClick={onOpenVersionNotes}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-all cursor-pointer text-sm font-medium"
        >
          <History size={18} className="text-blue-500" />
          <span>What's New (v1.2.0)</span>
        </button>
        <button 
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-all cursor-pointer text-sm font-medium"
        >
          <SettingsIcon size={18} />
          <span className="font-medium">Settings</span>
        </button>
      </div>
    </aside>
  );
};

function AppContent({ 
  onOpenSettings, 
  isSettingsOpen, 
  setIsSettingsOpen, 
  theme, 
  setTheme, 
  themePreset,
  setThemePreset,
  ebayEnv, 
  setEbayEnv, 
  handleSaveSettings 
}: {
  onOpenSettings: () => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  theme: 'dark' | 'light';
  setTheme: (t: 'dark' | 'light') => void;
  themePreset: 'tech' | 'botanical' | 'aurora';
  setThemePreset: (p: 'tech' | 'botanical' | 'aurora') => void;
  ebayEnv: 'sandbox' | 'production';
  setEbayEnv: (env: 'sandbox' | 'production') => void;
  handleSaveSettings: (t: 'dark' | 'light', env: 'sandbox' | 'production', preset: 'tech' | 'botanical' | 'aurora') => void;
}) {
  const location = useLocation();
  const isMobileView = location.pathname.startsWith('/mobile');

  // Mobile Screen detection for responsive navigation
  const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth < 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Modals States
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isVersionNotesOpen, setIsVersionNotesOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackRating, setFeedbackRating] = useState<number | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleEbayLogin = async () => {
    try {
      const response = await axios.get(`${API_BASE}/ebay/login`);
      window.open(response.data.url, '_blank', 'width=600,height=800');
    } catch (error) {
      alert('Failed to get eBay login URL');
    }
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/ebay', label: 'eBay Inventory', icon: Database },
    { path: '/mobile', label: 'Mobile Photo Capture', icon: Camera }
  ];

  const showDesktopSidebar = !isMobileView && !isMobileScreen;
  const showMobileHeader = !isMobileView && isMobileScreen;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Desktop Sidebar */}
      {showDesktopSidebar && (
        <Sidebar 
          onOpenSettings={onOpenSettings} 
          onOpenFeedback={() => setIsFeedbackOpen(true)}
          onOpenVersionNotes={() => setIsVersionNotesOpen(true)}
        />
      )}

      {/* Mobile Top Header & Menu */}
      {showMobileHeader && (
        <>
          <header className="fixed top-0 left-0 right-0 h-16 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 flex items-center justify-between px-5 z-[80]">
            <div className="flex flex-col">
              <span className="font-serif font-black text-xl tracking-tight text-white leading-none">Market<span className="text-blue-500 font-sans font-light">Maven</span></span>
              <span className="text-[8px] uppercase tracking-widest text-slate-500 font-bold mt-0.5">smart resell assistant</span>
            </div>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-colors cursor-pointer"
            >
              {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </header>

          {/* Menu Drawer Overlay */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-x-0 top-16 bottom-0 bg-slate-950/98 z-[75] flex flex-col p-6 space-y-6 overflow-y-auto border-t border-slate-900"
              >
                <nav className="space-y-2">
                  {navItems.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all ${
                        location.pathname === item.path 
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' 
                          : 'text-slate-400 hover:text-white hover:bg-slate-900'
                      }`}
                    >
                      <item.icon size={20} />
                      <span className="font-medium text-sm">{item.label}</span>
                      {location.pathname === item.path && <ChevronRight className="ml-auto" size={16} />}
                    </Link>
                  ))}
                </nav>

                <div className="pt-6 border-t border-slate-900 space-y-3 mt-auto pb-8">
                  <button 
                    onClick={() => { setIsMobileMenuOpen(false); handleEbayLogin(); }}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2 text-sm font-bold cursor-pointer"
                  >
                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                    Connect eBay
                  </button>
                  <button 
                    onClick={() => { setIsMobileMenuOpen(false); setIsFeedbackOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-all cursor-pointer font-bold border border-slate-900 text-xs justify-center"
                  >
                    <MessageSquare size={16} className="text-blue-500" />
                    Wife's Feedback Box
                  </button>
                  <button 
                    onClick={() => { setIsMobileMenuOpen(false); setIsVersionNotesOpen(true); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-all cursor-pointer font-bold border border-slate-900 text-xs justify-center"
                  >
                    <History size={16} className="text-blue-500" />
                    What's New (v1.2.0)
                  </button>
                  <button 
                    onClick={() => { setIsMobileMenuOpen(false); onOpenSettings(); }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-all cursor-pointer font-bold border border-slate-900 text-xs justify-center"
                  >
                    <SettingsIcon size={18} />
                    Settings
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Main Content Area */}
      <div 
        className={
          isMobileView 
            ? "p-0 min-h-screen" 
            : showMobileHeader 
              ? "p-5 pt-20 min-h-screen" 
              : "ml-72 p-12"
        }
      >
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/ebay" element={<EbayInventory />} />
          <Route 
            path="/mobile" 
            element={
              <MobileCapture 
                onOpenFeedback={() => setIsFeedbackOpen(true)}
                onOpenVersionNotes={() => setIsVersionNotesOpen(true)}
              />
            } 
          />
        </Routes>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsSettingsOpen(false)}
            />
            
            {/* Modal Container */}
            <div className="relative w-full max-w-md bg-slate-950 border border-slate-900 rounded-2xl shadow-2xl overflow-hidden glass p-6">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-900 flex-shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <SettingsIcon size={20} className="text-blue-500 animate-glow" />
                  Settings
                </h3>
                <button 
                  onClick={() => setIsSettingsOpen(false)} 
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6">
                {/* Theme Switcher */}
                <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-900">
                  <div>
                    <h4 className="font-semibold text-sm">Theme Mode</h4>
                    <p className="text-xs text-slate-500 mt-1">Switch between dark and light styles</p>
                  </div>
                  <button 
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="p-3 bg-slate-900 hover:bg-slate-800 text-blue-500 rounded-xl transition-all border border-slate-800 flex items-center gap-2 cursor-pointer text-xs font-semibold"
                  >
                    {theme === 'dark' ? (
                      <>
                        <Moon size={16} />
                        Dark Mode
                      </>
                    ) : (
                      <>
                        <Sun size={16} />
                        Light Mode
                      </>
                    )}
                  </button>
                </div>

                {/* Theme Preset Selector */}
                <div className="flex flex-col bg-slate-900/50 p-4 rounded-xl border border-slate-900 gap-3">
                  <div>
                    <h4 className="font-semibold text-sm">Design Theme</h4>
                    <p className="text-xs text-slate-500 mt-1">Select your colors and typography style</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setThemePreset('tech')}
                      className={`px-2 py-3 rounded-xl border transition-all text-xs font-bold flex flex-col items-center gap-1 cursor-pointer text-center ${
                        themePreset === 'tech'
                          ? 'bg-blue-500/10 text-blue-500 border-blue-500/30 shadow-sm shadow-blue-500/5'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xs font-semibold">Modern Tech</span>
                      <span className="text-[9px] font-normal opacity-70">Cobalt / Slate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setThemePreset('botanical')}
                      className={`px-2 py-3 rounded-xl border transition-all text-xs font-bold flex flex-col items-center gap-1 cursor-pointer text-center ${
                        themePreset === 'botanical'
                          ? 'bg-orange-500/10 text-orange-500 border-orange-500/30 shadow-sm shadow-orange-500/5'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xs font-semibold">Botanical</span>
                      <span className="text-[9px] font-normal opacity-70">Sage / Copper</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setThemePreset('aurora')}
                      className={`px-2 py-3 rounded-xl border transition-all text-xs font-bold flex flex-col items-center gap-1 cursor-pointer text-center ${
                        themePreset === 'aurora'
                          ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 shadow-sm shadow-purple-500/5'
                          : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xs font-semibold">Aurora</span>
                      <span className="text-[9px] font-normal opacity-70">Indigo / Teal</span>
                    </button>
                  </div>
                </div>

                {/* Environment Switcher */}
                <div className="flex justify-between items-center bg-slate-900/50 p-4 rounded-xl border border-slate-900">
                  <div>
                    <h4 className="font-semibold text-sm">eBay Environment</h4>
                    <p className="text-xs text-slate-500 mt-1">Sandbox vs. Production</p>
                  </div>
                  <button 
                    onClick={() => setEbayEnv(ebayEnv === 'sandbox' ? 'production' : 'sandbox')}
                    className={`px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 font-bold cursor-pointer text-xs uppercase tracking-wider border ${
                      ebayEnv === 'sandbox' 
                        ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' 
                        : 'bg-green-500/10 text-green-500 border-green-500/20'
                    }`}
                  >
                    {ebayEnv === 'sandbox' ? 'Sandbox' : 'Production'}
                  </button>
                </div>
                
                {ebayEnv === 'production' && (
                  <div className="p-3.5 bg-yellow-500/10 border border-yellow-500/25 rounded-xl text-[11px] text-yellow-500 leading-relaxed font-semibold">
                    ⚠️ WARNING: Production mode requires `EBAY_PROD_CLIENT_ID` and `EBAY_PROD_CLIENT_SECRET` configured in your backend `.env` file to list and authenticate successfully.
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-4 mt-8 pt-4 border-t border-slate-900 bg-white/0">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-6 py-2.5 glass rounded-xl hover:bg-slate-900 text-sm font-semibold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleSaveSettings(theme, ebayEnv, themePreset)}
                  className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20 text-sm transition-all cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Feedback Modal */}
      <AnimatePresence>
        {isFeedbackOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => { if (!submittingFeedback) setIsFeedbackOpen(false); }}
            />
            
            <div className="relative w-full max-w-md bg-slate-950 border border-slate-900 rounded-2xl shadow-2xl overflow-hidden glass p-6">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-900">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <MessageSquare size={20} className="text-blue-500" />
                  Wife's Feedback Box
                </h3>
                <button 
                  onClick={() => setIsFeedbackOpen(false)} 
                  disabled={submittingFeedback}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>

              {feedbackSuccess ? (
                <div className="text-center py-8 space-y-3">
                  <div className="w-12 h-12 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 size={24} />
                  </div>
                  <h4 className="font-bold text-white text-lg">Feedback Sent!</h4>
                  <p className="text-xs text-slate-400">Your message has been saved to the database for review.</p>
                  <button 
                    onClick={() => {
                      setFeedbackSuccess(false);
                      setFeedbackText('');
                      setFeedbackRating(null);
                      setIsFeedbackOpen(false);
                    }}
                    className="btn-primary mt-4 py-2 px-6 text-xs font-bold cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">How is your experience?</label>
                    <div className="flex justify-between p-2.5 bg-slate-900/50 rounded-xl border border-slate-900">
                      {[
                        { val: 1, char: '😡', label: 'Mad' },
                        { val: 2, char: '🙁', label: 'Sad' },
                        { val: 3, char: '😐', label: 'Meh' },
                        { val: 4, char: '🙂', label: 'Good' },
                        { val: 5, char: '😍', label: 'Love!' }
                      ].map((item) => (
                        <button
                          key={item.val}
                          type="button"
                          onClick={() => setFeedbackRating(item.val)}
                          className={`text-2xl p-2.5 rounded-lg transition-all hover:scale-110 cursor-pointer ${
                            feedbackRating === item.val 
                              ? 'bg-blue-500/20 border border-blue-500/30 scale-105 filter-none' 
                              : 'border border-transparent grayscale opacity-50 hover:grayscale-0 hover:opacity-100'
                          }`}
                          title={item.label}
                        >
                          {item.char}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Suggestions / Bugs / Notes</label>
                    <textarea
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                      placeholder="Write features you want, bugs you hit, or nice notes here..."
                      rows={4}
                      className="w-full bg-slate-900/50 border border-slate-950 rounded-xl p-3.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-all resize-none placeholder-slate-600"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-900">
                    <button
                      onClick={() => setIsFeedbackOpen(false)}
                      disabled={submittingFeedback}
                      className="px-5 py-2.5 bg-slate-900 border border-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!feedbackText.trim()) return;
                        setSubmittingFeedback(true);
                        try {
                          await axios.post(`${API_BASE}/feedback`, {
                            message: feedbackText,
                            rating: feedbackRating
                          });
                          setFeedbackSuccess(true);
                        } catch (err) {
                          alert('Failed to send feedback.');
                        } finally {
                          setSubmittingFeedback(false);
                        }
                      }}
                      disabled={submittingFeedback || !feedbackText.trim()}
                      className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        feedbackText.trim()
                          ? 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer shadow-lg shadow-blue-500/10'
                          : 'bg-slate-900 text-slate-500 border border-slate-800 cursor-not-allowed opacity-50'
                      }`}
                    >
                      {submittingFeedback ? 'Sending...' : 'Submit Feedback'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Version Notes Modal */}
      <AnimatePresence>
        {isVersionNotesOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <div 
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsVersionNotesOpen(false)}
            />
            
            <div className="relative w-full max-w-lg bg-slate-950 border border-slate-900 rounded-2xl shadow-2xl overflow-hidden glass p-6 flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-900 flex-shrink-0">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <History size={20} className="text-blue-500 animate-glow" />
                  What's New in MarketMaven
                </h3>
                <button 
                  onClick={() => setIsVersionNotesOpen(false)} 
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Scrollable contents */}
              <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-thin scrollbar-thumb-slate-900">
                
                {/* Version 1.2.0 */}
                <div className="space-y-3 relative pl-6 border-l-2 border-blue-500/30">
                  <div className="absolute left-[-6px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 border-2 border-slate-950" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">v1.2.0</span>
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-black uppercase">Current</span>
                    <span className="text-[11px] text-slate-500 ml-auto font-medium">June 4, 2026</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-300">Progressive Photo Capture & MarketMaven</h4>
                  <ul className="list-disc list-inside text-xs text-slate-400 space-y-1.5 pl-1 leading-relaxed">
                    <li><strong>MarketMaven Rebranding</strong>: Transitioned the app name and custom serif styling to MarketMaven.</li>
                    <li><strong>Mobile Capture Hub</strong>: Accessible on <code>/mobile</code> directly on smartphones. Uses rear cameras natively.</li>
                    <li><strong>Progressive background uploads</strong>: Capture cover, size tags, measurements $\rightarrow$ starts AI processing $\rightarrow$ capture remaining details photos while the AI runs in the background.</li>
                    <li><strong>Vite allowedHosts fix</strong>: Enabled wildcard ngrok domains. Runs on a single ngrok tunnel (no more port 3001 issues!).</li>
                    <li><strong>Desktop slots layout</strong>: Unified dashboard upload with the same structured slots. Supports auto-sorting drag-and-drops.</li>
                  </ul>
                </div>

                {/* Version 1.1.0 */}
                <div className="space-y-3 relative pl-6 border-l-2 border-slate-800">
                  <div className="absolute left-[-6px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-800" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-300">v1.1.0</span>
                    <span className="text-[11px] text-slate-500 ml-auto font-medium">June 3, 2026</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-400">Settings Manager & Live eBay Integration</h4>
                  <ul className="list-disc list-inside text-xs text-slate-500 space-y-1.5 pl-1 leading-relaxed">
                    <li><strong>Settings Manager</strong>: Integrated toggles for light/dark mode (Cozy Dark / Bright Linen) and Sandbox/Production environments.</li>
                    <li><strong>Traditional Listings Support</strong>: Unified Inventory APIs and Trading APIs to pull legacy eBay listings with a custom badge and support Ending listings.</li>
                    <li><strong>Token Persistence</strong>: Background SQLite token storage for persistent logins.</li>
                  </ul>
                </div>

                {/* Version 1.0.0 */}
                <div className="space-y-3 relative pl-6 border-l-2 border-slate-800">
                  <div className="absolute left-[-6px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-800" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-400">v1.0.0</span>
                    <span className="text-[11px] text-slate-500 ml-auto font-medium">May 2026</span>
                  </div>
                  <h4 className="text-xs font-bold text-slate-400">Initial Release</h4>
                  <ul className="list-disc list-inside text-xs text-slate-500 space-y-1.5 pl-1 leading-relaxed">
                    <li>Core Vision OCR AI database queue.</li>
                    <li>Automatic Jimp 1000x1000px square image cropping.</li>
                    <li>Copyable markdown list descriptions.</li>
                  </ul>
                </div>

              </div>

              <div className="flex justify-end pt-4 border-t border-slate-900 mt-6 flex-shrink-0 bg-white/0">
                <button
                  onClick={() => setIsVersionNotesOpen(false)}
                  className="px-6 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [themePreset, setThemePreset] = useState<'tech' | 'botanical' | 'aurora'>('tech');
  const [ebayEnv, setEbayEnv] = useState<'sandbox' | 'production'>('sandbox');
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Fetch settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await axios.get(`${API_BASE}/settings`);
        if (response.data) {
          const loadedTheme = response.data.theme || 'dark';
          const loadedEnv = response.data.ebay_env || 'sandbox';
          const loadedPreset = response.data.theme_preset || 'tech';
          setTheme(loadedTheme);
          setThemePreset(loadedPreset as 'tech' | 'botanical' | 'aurora');
          setEbayEnv(loadedEnv);
          
          // Apply theme class
          if (loadedTheme === 'light') {
            document.documentElement.classList.add('light');
          } else {
            document.documentElement.classList.remove('light');
          }

          // Apply theme preset class
          document.documentElement.classList.remove('theme-botanical', 'theme-aurora');
          if (loadedPreset === 'botanical') {
            document.documentElement.classList.add('theme-botanical');
          } else if (loadedPreset === 'aurora') {
            document.documentElement.classList.add('theme-aurora');
          }
        }
      } catch (error) {
        console.error('Failed to load settings from server:', error);
      } finally {
        setLoadingSettings(false);
      }
    };
    loadSettings();
  }, []);

  const handleSaveSettings = async (
    updatedTheme: 'dark' | 'light', 
    updatedEnv: 'sandbox' | 'production',
    updatedPreset: 'tech' | 'botanical' | 'aurora'
  ) => {
    try {
      await axios.post(`${API_BASE}/settings`, {
        theme: updatedTheme,
        ebay_env: updatedEnv,
        theme_preset: updatedPreset
      });

      setTheme(updatedTheme);
      setEbayEnv(updatedEnv);
      setThemePreset(updatedPreset);

      if (updatedTheme === 'light') {
        document.documentElement.classList.add('light');
      } else {
        document.documentElement.classList.remove('light');
      }

      document.documentElement.classList.remove('theme-botanical', 'theme-aurora');
      if (updatedPreset === 'botanical') {
        document.documentElement.classList.add('theme-botanical');
      } else if (updatedPreset === 'aurora') {
        document.documentElement.classList.add('theme-aurora');
      }

      alert('Settings updated successfully!');
      setIsSettingsOpen(false);
    } catch (error) {
      alert('Failed to save settings.');
    }
  };

  if (loadingSettings) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">Loading settings...</div>;
  }

  return (
    <Router>
      <AppContent 
        onOpenSettings={() => setIsSettingsOpen(true)}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        theme={theme}
        setTheme={setTheme}
        themePreset={themePreset}
        setThemePreset={setThemePreset}
        ebayEnv={ebayEnv}
        setEbayEnv={setEbayEnv}
        handleSaveSettings={handleSaveSettings}
      />
    </Router>
  );
}

export default App;
