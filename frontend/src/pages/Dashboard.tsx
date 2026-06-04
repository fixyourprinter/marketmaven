import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Scale, Tag, ExternalLink, CheckCircle2, Clock, Camera, Copy, Trash2, ChevronRight, Layers, Ruler, Sparkles, Plus, X, RefreshCw, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';

const API_BASE = '/api';

interface ListingItem {
  id: number;
  title: string;
  brand: string;
  size: string;
  weight: string;
  inventory_code: string;
  category: string;
  condition: string;
  material: string;
  measurements_note: string;
  style_details: string;
  country_of_origin: string;
  age: string;
  retail_price: string;
  etsy_tags: string;
  status: string;
  images: string;
  created_at: string;
}

const AI_STATUS_MESSAGES = [
  "Uploading high-resolution captures...",
  "Analyzing cover photo and silhouette...",
  "Scanning size labels and tags...",
  "Reading ruler/yardstick markings...",
  "Analyzing condition details...",
  "Generating descriptive listing title...",
  "Drafting final listing description..."
];

const Dashboard: React.FC = () => {
  const [items, setItems] = useState<ListingItem[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Progressive Photo States
  const [step1Images, setStep1Images] = useState<{
    cover: File | null;
    sizeTag: File | null;
    measurements: File | null;
  }>({
    cover: null,
    sizeTag: null,
    measurements: null
  });
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [step1Status, setStep1Status] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [step2Status, setStep2Status] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [draftId, setDraftId] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Visual/UX states
  const [simulatedProgress, setSimulatedProgress] = useState(0);
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);

  // File Input Refs
  const coverRef = React.useRef<HTMLInputElement>(null);
  const sizeTagRef = React.useRef<HTMLInputElement>(null);
  const measurementsRef = React.useRef<HTMLInputElement>(null);
  const additionalRef = React.useRef<HTMLInputElement>(null);

  // Status message rotation
  useEffect(() => {
    let interval: any;
    if (step1Status === 'processing' || step1Status === 'uploading') {
      interval = setInterval(() => {
        setStatusMessageIndex((prev) => (prev + 1) % AI_STATUS_MESSAGES.length);
      }, 7000);
    } else {
      setStatusMessageIndex(0);
    }
    return () => clearInterval(interval);
  }, [step1Status]);

  // Simulated progress bar
  useEffect(() => {
    let interval: any;
    if (step1Status === 'uploading') {
      interval = setInterval(() => {
        setSimulatedProgress((prev) => Math.min(prev + 5, 25));
      }, 500);
    } else if (step1Status === 'processing') {
      interval = setInterval(() => {
        setSimulatedProgress((prev) => {
          if (prev < 60) return prev + 2;
          if (prev < 90) return prev + 0.8;
          return prev;
        });
      }, 1000);
    } else if (step1Status === 'success') {
      setSimulatedProgress(100);
    } else {
      setSimulatedProgress(0);
    }
    return () => clearInterval(interval);
  }, [step1Status]);

  const [feedbackItems, setFeedbackItems] = useState<any[]>([]);

  const fetchItems = async () => {
    try {
      const response = await axios.get(`${API_BASE}/listings/items`);
      setItems(response.data);
    } catch (error) {
      console.error('Failed to fetch items');
    }
  };

  const fetchFeedback = async () => {
    try {
      const response = await axios.get(`${API_BASE}/feedback`);
      setFeedbackItems(response.data);
    } catch (error) {
      console.error('Failed to fetch feedback');
    }
  };

  const handleResolveFeedback = async (id: number) => {
    try {
      await axios.post(`${API_BASE}/feedback/${id}/resolve`);
      fetchFeedback();
    } catch (error) {
      alert('Failed to resolve feedback');
    }
  };

  const handleDeleteFeedback = async (id: number) => {
    if (!confirm('Are you sure you want to delete this feedback item?')) return;
    try {
      await axios.delete(`${API_BASE}/feedback/${id}`);
      fetchFeedback();
    } catch (error) {
      alert('Failed to delete feedback');
    }
  };

  useEffect(() => {
    fetchItems();
    fetchFeedback();
  }, []);

  const handleDroppedFiles = (files: FileList) => {
    const fileArray = Array.from(files);
    if (fileArray.length > 0) {
      setStep1Images(prev => ({
        cover: fileArray[0] || prev.cover,
        sizeTag: fileArray[1] || prev.sizeTag,
        measurements: fileArray[2] || prev.measurements,
      }));
      if (fileArray.length > 3) {
        setAdditionalImages(fileArray.slice(3, 10));
      }
    }
  };

  const handleFileChange = (slot: 'cover' | 'sizeTag' | 'measurements', file: File | null) => {
    setStep1Images(prev => ({
      ...prev,
      [slot]: file
    }));
  };

  const handleAdditionalFilesChange = (files: FileList) => {
    const selectedFiles = Array.from(files);
    const spaceLeft = 7 - additionalImages.length;
    setAdditionalImages(prev => [...prev, ...selectedFiles.slice(0, spaceLeft)]);
  };

  const handleSendToAI = async () => {
    if (!step1Images.cover || !step1Images.sizeTag || !step1Images.measurements) return;

    setStep1Status('uploading');
    const formData = new FormData();
    formData.append('images', step1Images.cover);
    formData.append('images', step1Images.sizeTag);
    formData.append('images', step1Images.measurements);

    try {
      setTimeout(() => {
        setStep1Status('processing');
      }, 2000);

      const response = await axios.post(`${API_BASE}/listings/process`, formData);
      setDraftId(response.data.id);
      setStep1Status('success');
      fetchItems();
    } catch (error) {
      console.error(error);
      setStep1Status('error');
    }
  };

  const handleUploadRemaining = async () => {
    if (!draftId) return;
    if (additionalImages.length === 0) {
      handleResetUploadFlow();
      return;
    }

    setStep2Status('uploading');
    const formData = new FormData();
    additionalImages.forEach(file => {
      formData.append('images', file);
    });

    try {
      await axios.post(`${API_BASE}/listings/items/${draftId}/images`, formData);
      setStep2Status('success');
      handleResetUploadFlow();
      fetchItems();
    } catch (error) {
      console.error(error);
      setStep2Status('error');
    }
  };

  const handleResetUploadFlow = () => {
    setStep1Images({ cover: null, sizeTag: null, measurements: null });
    setAdditionalImages([]);
    setStep1Status('idle');
    setStep2Status('idle');
    setDraftId(null);
    setSimulatedProgress(0);
    setStatusMessageIndex(0);
    if (coverRef.current) coverRef.current.value = '';
    if (sizeTagRef.current) sizeTagRef.current.value = '';
    if (measurementsRef.current) measurementsRef.current.value = '';
    if (additionalRef.current) additionalRef.current.value = '';
  };

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleDroppedFiles(e.dataTransfer.files);
    }
  };

  const copyToClipboard = (item: ListingItem) => {
    const text = `TITLE:
${item.title}

CONDITION:
${item.condition}

MATERIAL:
${item.material}

MEASUREMENTS NOTE:
${item.measurements_note}

SHIPPING NOTE:
Items ship next business day.

STYLE DETAILS:
${item.style_details}

COUNTRY OF ORIGIN:
${item.country_of_origin}

AGE:
${item.age}

RETAIL PRICE:
${item.retail_price}

${item.etsy_tags ? `ETSY TAGS:\n${item.etsy_tags}` : ''}`;
    
    navigator.clipboard.writeText(text);
    alert('Listing template copied to clipboard!');
  };

  const handleEbayList = async (id: number) => {
    try {
      const response = await axios.post(`${API_BASE}/listings/items/${id}/ebay`);
      if (response.data.status === 'success') {
        alert('Item successfully drafted on eBay!');
        fetchItems();
      } else {
        alert('Error listing to eBay: ' + response.data.message);
      }
    } catch (error) {
      alert('Failed to list on eBay. Make sure you are logged in.');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this pending item?')) return;
    try {
      await axios.delete(`${API_BASE}/listings/items/${id}`);
      fetchItems();
    } catch (error) {
      alert('Failed to delete item');
    }
  };

  return (
    <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Upload Zone */}
      <section className="lg:col-span-1">
        {/* Mobile Capture Call to Action */}
        <div className="mb-6 p-5 rounded-2xl bg-gradient-to-br from-blue-600/10 to-slate-900/50 border border-blue-500/20 shadow-lg relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-10 group-hover:scale-110 transition-transform duration-500">
            <Camera size={120} className="text-blue-500" />
          </div>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0 border border-blue-500/30">
              <Camera className="text-blue-400" size={24} />
            </div>
            <div className="space-y-1.5 flex-1 pr-6">
              <h4 className="font-serif text-lg font-bold text-white leading-tight">Mobile Capture Hub</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Snap the first 3 critical photos to start background AI extraction immediately, then continue taking detail photos while it thinks.
              </p>
              <Link 
                to="/mobile"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-white mt-2 group/btn"
              >
                Open Mobile Capture
                <ChevronRight size={14} className="group-hover/btn:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          </div>
        </div>

        {/* Step 1 & 2 Upload Flow */}
        <div 
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
          className={`glass-card p-6 border-2 transition-all relative ${
            dragActive ? 'border-blue-500 bg-blue-500/5' : 'border-white/5'
          }`}
        >
          {/* Hidden inputs */}
          <input 
            ref={coverRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => e.target.files && handleFileChange('cover', e.target.files[0])} 
          />
          <input 
            ref={sizeTagRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => e.target.files && handleFileChange('sizeTag', e.target.files[0])} 
          />
          <input 
            ref={measurementsRef}
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => e.target.files && handleFileChange('measurements', e.target.files[0])} 
          />
          <input 
            ref={additionalRef}
            type="file" 
            accept="image/*" 
            multiple
            className="hidden" 
            onChange={(e) => e.target.files && handleAdditionalFilesChange(e.target.files)} 
          />

          {/* Idle / Error State (Capturing first 3) */}
          {(step1Status === 'idle' || step1Status === 'error') && (
            <div className="space-y-5">
              <div className="text-center pb-2 border-b border-white/5">
                <h3 className="font-serif text-lg font-bold text-white flex items-center justify-center gap-2">
                  <Sparkles size={16} className="text-blue-500" />
                  AI Process: The Big Three
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Drag and drop 3 files here, or select each slot manually.
                </p>
              </div>

              {/* Slot 1: Cover */}
              <div className="relative">
                {step1Images.cover ? (
                  <div className="flex items-center gap-3 p-2 bg-white/5 border border-white/10 rounded-xl">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 border border-white/5">
                      <img src={URL.createObjectURL(step1Images.cover)} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate">1. Cover Photo</p>
                      <p className="text-[10px] text-slate-500 truncate">{step1Images.cover.name}</p>
                    </div>
                    <button 
                      onClick={() => handleFileChange('cover', null)}
                      className="p-1 hover:text-red-400 hover:bg-white/5 rounded transition-all cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => coverRef.current?.click()}
                    className="w-full flex items-center gap-3 p-3.5 border border-dashed border-white/10 hover:border-blue-500/30 bg-white/[0.01] hover:bg-white/[0.03] rounded-xl text-left transition-all group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 border border-blue-500/20 group-hover:scale-105 transition-transform">
                      <Camera className="text-blue-400" size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-200">1. Cover Photo</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">Front side centered view</p>
                    </div>
                  </button>
                )}
              </div>

              {/* Slot 2: Size Tag */}
              <div className="relative">
                {step1Images.sizeTag ? (
                  <div className="flex items-center gap-3 p-2 bg-white/5 border border-white/10 rounded-xl">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 border border-white/5">
                      <img src={URL.createObjectURL(step1Images.sizeTag)} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate">2. Size Tag</p>
                      <p className="text-[10px] text-slate-500 truncate">{step1Images.sizeTag.name}</p>
                    </div>
                    <button 
                      onClick={() => handleFileChange('sizeTag', null)}
                      className="p-1 hover:text-red-400 hover:bg-white/5 rounded transition-all cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => sizeTagRef.current?.click()}
                    className="w-full flex items-center gap-3 p-3.5 border border-dashed border-white/10 hover:border-blue-500/30 bg-white/[0.01] hover:bg-white/[0.03] rounded-xl text-left transition-all group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 border border-blue-500/20 group-hover:scale-105 transition-transform">
                      <Layers className="text-blue-400" size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-200">2. Size Tag</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">Brand tag, size labels</p>
                    </div>
                  </button>
                )}
              </div>

              {/* Slot 3: measurements */}
              <div className="relative">
                {step1Images.measurements ? (
                  <div className="flex items-center gap-3 p-2 bg-white/5 border border-white/10 rounded-xl">
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-900 border border-white/5">
                      <img src={URL.createObjectURL(step1Images.measurements)} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-200 truncate">3. Ruler / Measurements</p>
                      <p className="text-[10px] text-slate-500 truncate">{step1Images.measurements.name}</p>
                    </div>
                    <button 
                      onClick={() => handleFileChange('measurements', null)}
                      className="p-1 hover:text-red-400 hover:bg-white/5 rounded transition-all cursor-pointer"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => measurementsRef.current?.click()}
                    className="w-full flex items-center gap-3 p-3.5 border border-dashed border-white/10 hover:border-blue-500/30 bg-white/[0.01] hover:bg-white/[0.03] rounded-xl text-left transition-all group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 border border-blue-500/20 group-hover:scale-105 transition-transform">
                      <Ruler className="text-blue-400" size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-200">3. Ruler / Measurements</p>
                      <p className="text-[9px] text-slate-500 mt-0.5">Laid flat next to scale</p>
                    </div>
                  </button>
                )}
              </div>

              {step1Status === 'error' && (
                <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-xl text-xs text-red-400 font-medium">
                  ⚠️ AI analysis failed. Please check Ollama and try again.
                </div>
              )}

              {/* Submit to AI */}
              <button 
                onClick={handleSendToAI}
                disabled={!step1Images.cover || !step1Images.sizeTag || !step1Images.measurements}
                className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 border text-sm shadow-md transition-all ${
                  (step1Images.cover && step1Images.sizeTag && step1Images.measurements)
                    ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-600 cursor-pointer shadow-blue-500/10 active:scale-[0.99]'
                    : 'bg-white/5 text-slate-500 border-white/5 opacity-50 cursor-not-allowed'
                }`}
              >
                <Sparkles size={16} />
                Send to AI (Start Processing)
              </button>
            </div>
          )}

          {/* Uploading / Processing State */}
          {(step1Status === 'uploading' || step1Status === 'processing' || step1Status === 'success') && (
            <div className="space-y-6">
              
              {/* AI Status Panel */}
              <div className="bg-slate-900/40 border border-white/5 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {step1Status === 'success' ? (
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 flex items-center justify-center border border-green-500/20 text-green-400">
                      <CheckCircle2 size={16} />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
                      <RefreshCw className="animate-spin" size={16} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xs font-bold text-white">AI Analysis Status</h4>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5 h-3.5">
                      {step1Status === 'uploading' && "Uploading Big Three photos..."}
                      {step1Status === 'processing' && AI_STATUS_MESSAGES[statusMessageIndex]}
                      {step1Status === 'success' && `Draft Saved (Draft ID: #${draftId})`}
                    </p>
                  </div>
                </div>

                <div className="w-full h-1 bg-black/40 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-blue-500 transition-all duration-500 ease-out" 
                    style={{ width: `${simulatedProgress}%` }}
                  />
                </div>
              </div>

              {/* Step 2: Detail photos selection */}
              <div className="space-y-3">
                <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider flex justify-between items-center">
                  <span>Detail Photos ({additionalImages.length}/7)</span>
                  {additionalImages.length < 7 && (
                    <button 
                      onClick={() => additionalRef.current?.click()}
                      className="text-[10px] font-bold text-blue-400 hover:text-white flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus size={12} /> Add Files
                    </button>
                  )}
                </h4>

                <div className="grid grid-cols-4 gap-2">
                  {additionalImages.map((file, idx) => (
                    <div key={idx} className="relative aspect-square rounded-lg border border-white/5 overflow-hidden bg-slate-900">
                      <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setAdditionalImages(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 p-0.5 bg-black/60 rounded text-slate-400 hover:text-white transition-colors cursor-pointer border border-white/5"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}

                  {additionalImages.length < 7 && (
                    <button 
                      onClick={() => additionalRef.current?.click()}
                      className="aspect-square border border-dashed border-white/10 hover:border-blue-500/30 bg-white/[0.01] hover:bg-white/[0.03] rounded-lg flex flex-col items-center justify-center p-1 transition-all text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      <Plus size={16} />
                      <span className="text-[8px] font-bold mt-1">Add Detail</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Finish Actions */}
              <div className="pt-2 border-t border-white/5 space-y-2">
                {step1Status === 'success' ? (
                  <button 
                    onClick={handleUploadRemaining}
                    disabled={step2Status === 'uploading'}
                    className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 border border-green-700 shadow-md text-xs cursor-pointer active:scale-[0.99] transition-all"
                  >
                    {step2Status === 'uploading' ? (
                      <>
                        <RefreshCw size={14} className="animate-spin" />
                        Uploading details...
                      </>
                    ) : additionalImages.length > 0 ? (
                      <>
                        <CheckCircle2 size={14} />
                        Upload {additionalImages.length} Details & Finish
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} />
                        Finish Draft
                      </>
                    )}
                  </button>
                ) : (
                  <button 
                    disabled
                    className="w-full py-3 bg-white/5 text-slate-500 border-white/5 rounded-xl font-semibold flex items-center justify-center gap-2 border text-xs cursor-not-allowed opacity-50"
                  >
                    <RefreshCw size={14} className="animate-spin" />
                    AI Processing...
                  </button>
                )}

                <button 
                  onClick={handleResetUploadFlow}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl font-medium text-xs transition-colors cursor-pointer border border-white/5"
                >
                  Start Over / Reset
                </button>
              </div>

            </div>
          )}

        </div>

        <div className="mt-8 glass-card">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <Package size={18} className="text-blue-400" />
            Recent Inventory
          </h4>
          <div className="space-y-4">
            {items.slice(0, 3).map((item) => (
              <div key={item.id} className="flex gap-4 p-3 rounded-lg hover:bg-white/5 transition-colors group">
                <div className="w-12 h-12 bg-slate-800 rounded-lg flex-shrink-0 flex items-center justify-center">
                  <Tag size={20} className="text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-slate-500">#{item.inventory_code} • {item.weight}lbs</p>
                </div>
                <CheckCircle2 size={16} className="text-green-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>

        {/* Wife's Feedback Box Suggestions List */}
        <div className="mt-8 glass-card">
          <h4 className="font-semibold mb-4 flex items-center gap-2">
            <MessageSquare size={18} className="text-blue-500" />
            Wife's Suggestions ({feedbackItems.filter(f => f.status === 'pending').length} unread)
          </h4>
          
          {feedbackItems.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">No feedback submitted yet.</p>
          ) : (
            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-900">
              {feedbackItems.map((item) => {
                const ratingSmileys: Record<number, string> = {
                  1: '😡',
                  2: '🙁',
                  3: '😐',
                  4: '🙂',
                  5: '😍'
                };
                const isPending = item.status === 'pending';
                const dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div 
                    key={item.id} 
                    className={`p-3 rounded-xl border transition-all text-left space-y-2 relative group/feed ${
                      isPending 
                        ? 'bg-blue-500/[0.02] border-blue-500/10' 
                        : 'bg-white/[0.01] border-white/5 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {item.rating && (
                        <span className="text-lg" title={`Rating: ${item.rating}/5`}>
                          {ratingSmileys[item.rating]}
                        </span>
                      )}
                      <span className="text-[10px] text-slate-500 font-semibold">{dateStr}</span>
                      
                      {/* Action buttons (only visible on hover or mobile) */}
                      <div className="ml-auto flex gap-1.5 opacity-0 group-hover/feed:opacity-100 transition-opacity">
                        {isPending && (
                          <button 
                            onClick={() => handleResolveFeedback(item.id)}
                            className="p-1 hover:text-green-400 hover:bg-white/5 rounded transition-colors cursor-pointer"
                            title="Mark as Read / Resolved"
                          >
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDeleteFeedback(item.id)}
                          className="p-1 hover:text-red-400 hover:bg-white/5 rounded transition-colors cursor-pointer"
                          title="Delete Suggestion"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    
                    <p className={`text-xs leading-relaxed text-slate-350 break-words ${!isPending ? 'line-through text-slate-500' : ''}`}>
                      {item.message}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Listings Table */}
      <section className="lg:col-span-2">
        <div className="glass-card h-full min-h-[600px]">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Clock size={24} className="text-blue-400" />
              Pending Listings
            </h2>
            <div className="flex gap-2">
              <button className="px-3 py-1 text-sm glass rounded-lg hover:bg-white/5">Filter</button>
            </div>
          </div>

          <div className="overflow-x-auto px-6 pb-6">
            {items.filter(i => i.status !== 'listed').length > 0 ? (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                    <th className="pb-4">Item Details</th>
                    <th className="pb-4">Metadata</th>
                    <th className="pb-4">Status</th>
                    <th className="pb-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <AnimatePresence>
                    {items.filter(i => i.status !== 'listed').map((item) => (
                      <React.Fragment key={item.id}>
                        <motion.tr 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                          className={`group hover:bg-white/[0.02] transition-colors cursor-pointer ${expandedId === item.id ? 'bg-white/[0.04]' : ''}`}
                        >
                          <td className="py-6">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-200 mb-1">{item.title}</span>
                              <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">{item.brand}</span>
                                <span className="text-xs text-slate-500">{item.category}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-6">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Scale size={12} /> {item.weight}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-slate-400">
                                <Tag size={12} /> {item.inventory_code}
                              </div>
                            </div>
                          </td>
                          <td className="py-6">
                            <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                              {item.status}
                            </span>
                          </td>
                          <td className="py-6 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                                className="p-2 glass rounded-lg hover:text-red-400 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 size={16} />
                              </button>
                              <button className="p-2 glass rounded-lg hover:text-blue-400 transition-colors">
                                <ExternalLink size={16} />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                        <AnimatePresence>
                          {expandedId === item.id && (
                            <motion.tr
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                            >
                              <td colSpan={4} className="p-0 overflow-hidden border-b border-white/5">
                                <div className="p-8 bg-black/20 rounded-xl m-4 space-y-6 relative group/detail border border-white/5">
                                  <div className="absolute top-6 right-6 flex gap-3">
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); copyToClipboard(item); }}
                                      className="p-2 glass rounded-lg hover:bg-blue-500/20 hover:text-blue-400 transition-all flex items-center gap-2 text-xs font-semibold border border-white/5"
                                    >
                                      <Copy size={16} />
                                      Copy Template
                                    </button>
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); handleEbayList(item.id); }}
                                      className="p-2 bg-blue-600 rounded-lg hover:bg-blue-500 text-white transition-all flex items-center gap-2 text-xs font-semibold shadow-lg shadow-blue-500/20"
                                    >
                                      <ExternalLink size={16} />
                                      List on eBay
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                      <div>
                                        <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">1. TITLE</h5>
                                        <p className="text-sm text-slate-200 glass p-3 rounded-lg border-blue-500/20 border-l-2 leading-relaxed">{item.title}</p>
                                      </div>
                                      <div>
                                        <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">2. CONDITION</h5>
                                        <p className="text-sm text-slate-300 italic">"{item.condition}"</p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">3. MATERIAL</h5>
                                          <p className="text-sm text-slate-300">{item.material}</p>
                                        </div>
                                        <div>
                                          <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">4. WEIGHT</h5>
                                          <p className="text-sm text-slate-300">{item.weight} lbs</p>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="space-y-4">
                                      <div>
                                        <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">6. STYLE DETAILS</h5>
                                        <p className="text-sm text-slate-300 leading-relaxed">{item.style_details}</p>
                                      </div>
                                      <div className="grid grid-cols-2 gap-4">
                                        <div>
                                          <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">7. COUNTRY</h5>
                                          <p className="text-sm text-slate-300">{item.country_of_origin}</p>
                                        </div>
                                        <div>
                                          <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">8. AGE</h5>
                                          <p className="text-sm text-slate-300">{item.age}</p>
                                        </div>
                                      </div>
                                      <div>
                                        <h5 className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2">9. RETAIL PRICE</h5>
                                        <p className="text-lg font-bold text-green-400">{item.retail_price}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </motion.tr>
                          )}
                        </AnimatePresence>
                      </React.Fragment>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <Package size={48} className="mb-4 opacity-20" />
                <p>All items have been processed or listed!</p>
              </div>
            )}

            {/* Listed Items Section */}
            {items.filter(i => i.status === 'listed').length > 0 && (
              <div className="mt-12 border-t border-white/5 pt-12">
                 <h3 className="text-lg font-bold mb-6 text-green-400 flex items-center gap-2">
                   <div className="w-8 h-8 rounded-full bg-green-500/10 flex items-center justify-center">
                     <CheckCircle2 size={18} />
                   </div>
                   Successfully Listed on eBay
                 </h3>
                 <div className="grid grid-cols-1 gap-3">
                   {items.filter(i => i.status === 'listed').map(item => (
                     <motion.div 
                       key={item.id}
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       className="flex justify-between items-center p-4 glass rounded-xl border border-green-500/10 hover:bg-green-500/[0.02] transition-colors"
                     >
                       <div className="flex items-center gap-4">
                         <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-green-500/50">
                           <Package size={20} />
                         </div>
                         <div>
                           <p className="font-semibold text-slate-200">{item.title}</p>
                           <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">SKU: {item.inventory_code}</p>
                         </div>
                       </div>
                       <div className="flex items-center gap-3">
                         <span className="px-2 py-1 rounded bg-green-500/10 text-green-500 text-[9px] font-black uppercase tracking-tighter border border-green-500/20">LIVE ON EBAY</span>
                         <button 
                           onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                           className="p-2 glass rounded-lg hover:text-red-400 hover:bg-red-500/10 transition-colors"
                         >
                            <Trash2 size={14} />
                         </button>
                         <button className="p-2 glass rounded-lg hover:text-blue-400 transition-colors">
                            <ExternalLink size={14} />
                         </button>
                       </div>
                     </motion.div>
                   ))}
                 </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
};

export default Dashboard;
