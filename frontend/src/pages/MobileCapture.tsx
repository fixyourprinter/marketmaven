import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  Camera, 
  X, 
  CheckCircle2, 
  Sparkles, 
  Plus, 
  ArrowLeft, 
  AlertCircle, 
  RefreshCw,
  Package,
  Layers,
  Tag,
  Scale,
  MessageSquare,
  History
} from 'lucide-react';

const API_BASE = '/api';

type Step1Images = {
  cover: File | null;
  sizeTag: File | null;
  measurements: File | null;
};

const AI_STATUS_MESSAGES = [
  "Uploading high-resolution captures...",
  "Analyzing cover photo and garment silhouette...",
  "Scanning brand label and size tag markings...",
  "Reading SKU & shipping scale weight...",
  "Extracting fabric material composition...",
  "Analyzing condition details and aesthetics...",
  "Generating descriptive listing title...",
  "Drafting final listing description...",
  "Assembling your items database draft..."
];

interface MobileCaptureProps {
  onOpenFeedback: () => void;
  onOpenVersionNotes: () => void;
}

export default function MobileCapture({ onOpenFeedback, onOpenVersionNotes }: MobileCaptureProps) {
  const navigate = useNavigate();

  // State
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [step1Images, setStep1Images] = useState<Step1Images>({
    cover: null,
    sizeTag: null,
    measurements: null,
  });
  
  const [additionalImages, setAdditionalImages] = useState<File[]>([]);
  const [step1Status, setStep1Status] = useState<'idle' | 'uploading' | 'processing' | 'success' | 'error'>('idle');
  const [step2Status, setStep2Status] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  
  const [draftId, setDraftId] = useState<number | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Visual/UX State
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);
  const [simulatedProgress, setSimulatedProgress] = useState(0);

  // File Input Refs
  const coverInputRef = useRef<HTMLInputElement>(null);
  const sizeTagInputRef = useRef<HTMLInputElement>(null);
  const measurementsInputRef = useRef<HTMLInputElement>(null);
  const additionalInputRef = useRef<HTMLInputElement>(null);

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

  // Handle slot camera triggers
  const triggerCamera = (slot: 'cover' | 'sizeTag' | 'measurements') => {
    if (slot === 'cover') coverInputRef.current?.click();
    if (slot === 'sizeTag') sizeTagInputRef.current?.click();
    if (slot === 'measurements') measurementsInputRef.current?.click();
  };

  const handleFileChange = (slot: 'cover' | 'sizeTag' | 'measurements', e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setStep1Images(prev => ({
        ...prev,
        [slot]: e.target.files![0]
      }));
    }
  };

  const removeImage = (slot: 'cover' | 'sizeTag' | 'measurements') => {
    setStep1Images(prev => ({
      ...prev,
      [slot]: null
    }));
    // Reset the input value so the same file can be selected again
    if (slot === 'cover' && coverInputRef.current) coverInputRef.current.value = '';
    if (slot === 'sizeTag' && sizeTagInputRef.current) sizeTagInputRef.current.value = '';
    if (slot === 'measurements' && measurementsInputRef.current) measurementsInputRef.current.value = '';
  };

  // Handle additional detail image captures
  const triggerAdditionalCamera = () => {
    if (additionalImages.length >= 7) return;
    additionalInputRef.current?.click();
  };

  const handleAdditionalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      const spaceLeft = 7 - additionalImages.length;
      const filesToAdd = selectedFiles.slice(0, spaceLeft);
      
      setAdditionalImages(prev => [...prev, ...filesToAdd]);
    }
    if (additionalInputRef.current) {
      additionalInputRef.current.value = '';
    }
  };

  const removeAdditionalImage = (index: number) => {
    setAdditionalImages(prev => prev.filter((_, i) => i !== index));
  };

  // Start Step 1 AI Processing Upload
  const handleSendToAI = async () => {
    if (!step1Images.cover || !step1Images.sizeTag || !step1Images.measurements) return;

    setStep1Status('uploading');
    setPhase(2); // Go to phase 2 immediately so user can take remaining photos

    const formData = new FormData();
    formData.append('images', step1Images.cover);
    formData.append('images', step1Images.sizeTag);
    formData.append('images', step1Images.measurements);

    try {
      // Transition to processing state after upload simulation starts
      setTimeout(() => {
        if (step1Status === 'uploading') setStep1Status('processing');
      }, 2000);

      const response = await axios.post(`${API_BASE}/listings/process`, formData);
      
      setDraftId(response.data.id);
      setAiResult(response.data);
      setStep1Status('success');
    } catch (err: any) {
      console.error(err);
      setStep1Status('error');
      setErrorMessage(err.response?.data?.error || 'AI analysis failed. Check server and Ollama connection.');
    }
  };

  // Upload Step 2 Remaining detail photos
  const handleUploadRemaining = async () => {
    if (!draftId) return;
    
    // If no additional images are captured, we can just complete the flow
    if (additionalImages.length === 0) {
      setPhase(3);
      return;
    }

    setStep2Status('uploading');
    const formData = new FormData();
    additionalImages.forEach(file => {
      formData.append('images', file);
    });

    try {
      const response = await axios.post(`${API_BASE}/listings/items/${draftId}/images`, formData);
      
      // Update local AI result with full images list
      if (aiResult) {
        setAiResult({
          ...aiResult,
          images: response.data.images
        });
      }
      
      setStep2Status('success');
      setPhase(3);
    } catch (err: any) {
      console.error(err);
      setStep2Status('error');
      setErrorMessage(err.response?.data?.error || 'Failed to append additional photos.');
    }
  };

  // Reset the capture states for a new item
  const handleReset = () => {
    setPhase(1);
    setStep1Images({ cover: null, sizeTag: null, measurements: null });
    setAdditionalImages([]);
    setStep1Status('idle');
    setStep2Status('idle');
    setDraftId(null);
    setAiResult(null);
    setErrorMessage(null);
    setSimulatedProgress(0);
    setStatusMessageIndex(0);
    
    // Reset file elements
    if (coverInputRef.current) coverInputRef.current.value = '';
    if (sizeTagInputRef.current) sizeTagInputRef.current.value = '';
    if (measurementsInputRef.current) measurementsInputRef.current.value = '';
    if (additionalInputRef.current) additionalInputRef.current.value = '';
  };

  // Check if first 3 are fully captured
  const isStep1Complete = step1Images.cover && step1Images.sizeTag && step1Images.measurements;

  return (
    <div className="w-full min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans relative overflow-x-hidden selection:bg-blue-500 selection:text-white">
      {/* Hidden inputs */}
      <input 
        ref={coverInputRef}
        type="file" 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
        onChange={(e) => handleFileChange('cover', e)} 
      />
      <input 
        ref={sizeTagInputRef}
        type="file" 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
        onChange={(e) => handleFileChange('sizeTag', e)} 
      />
      <input 
        ref={measurementsInputRef}
        type="file" 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
        onChange={(e) => handleFileChange('measurements', e)} 
      />
      <input 
        ref={additionalInputRef}
        type="file" 
        accept="image/*" 
        capture="environment" 
        multiple
        className="hidden" 
        onChange={handleAdditionalFileChange} 
      />

      {/* Top Header */}
      <header className="sticky top-0 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 px-5 py-4 flex items-center justify-between z-40">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => {
              if (phase > 1 && window.confirm("Are you sure you want to exit? Your progressive capture will be lost.")) {
                navigate('/');
              } else if (phase === 1) {
                navigate('/');
              }
            }}
            className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-serif font-black text-lg tracking-tight text-white leading-none">Market<span className="text-blue-500 font-sans font-light">Maven</span></h1>
            <p className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mt-0.5">Mobile Capture Hub</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button 
            onClick={onOpenFeedback}
            className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="Wife's Feedback Box"
          >
            <MessageSquare size={18} />
          </button>
          <button 
            onClick={onOpenVersionNotes}
            className="p-2 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            title="What's New"
          >
            <History size={18} />
          </button>

          {phase === 1 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
              Step 1 of 2
            </span>
          )}
          {phase === 2 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 animate-pulse">
              Step 2
            </span>
          )}
          {phase === 3 && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
              Success
            </span>
          )}
        </div>
      </header>

      {/* Content wrapper */}
      <main className="flex-1 px-5 py-6 max-w-md mx-auto w-full flex flex-col justify-between">
        
        {/* Phase 1: Snap first 3 */}
        {phase === 1 && (
          <div className="space-y-6 flex-1 flex flex-col">
            <div className="space-y-1">
              <h2 className="text-2xl font-serif font-bold text-white flex items-center gap-2">
                <Sparkles className="text-blue-500 animate-pulse" size={22} />
                AI Capture Capture
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">
                Snap the first 3 critical photos to start background AI analysis immediately.
              </p>
            </div>

            {/* Photo Slots */}
            <div className="space-y-4 py-2">
              
              {/* Slot 1: Cover Photo */}
              <div className="relative">
                {step1Images.cover ? (
                  <div className="relative h-44 rounded-xl border border-slate-800 overflow-hidden bg-slate-900 group">
                    <img 
                      src={URL.createObjectURL(step1Images.cover)} 
                      alt="Cover preview" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-3.5 flex items-end justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Package size={14} className="text-blue-400" />
                        1. Cover Photo
                      </span>
                      <button 
                        onClick={() => removeImage('cover')}
                        className="p-1.5 bg-black/60 hover:bg-red-600/80 text-white rounded-lg transition-colors border border-white/10"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => triggerCamera('cover')}
                    className="w-full h-40 border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-900/40 hover:bg-slate-900/80 rounded-xl flex flex-col items-center justify-center p-4 transition-all group"
                  >
                    <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      <Camera className="text-blue-400" size={24} />
                    </div>
                    <span className="text-sm font-bold text-slate-200">1. Cover Photo</span>
                    <span className="text-xs text-slate-500 mt-1">Clear, centered shot of front of the item</span>
                  </button>
                )}
              </div>

              {/* Slot 2: Size Tag */}
              <div className="relative">
                {step1Images.sizeTag ? (
                  <div className="relative h-44 rounded-xl border border-slate-800 overflow-hidden bg-slate-900 group">
                    <img 
                      src={URL.createObjectURL(step1Images.sizeTag)} 
                      alt="Size tag preview" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-3.5 flex items-end justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                        <Tag size={14} className="text-blue-400" />
                        2. Size Tag
                      </span>
                      <button 
                        onClick={() => removeImage('sizeTag')}
                        className="p-1.5 bg-black/60 hover:bg-red-600/80 text-white rounded-lg transition-colors border border-white/10"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => triggerCamera('sizeTag')}
                    className="w-full h-40 border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-900/40 hover:bg-slate-900/80 rounded-xl flex flex-col items-center justify-center p-4 transition-all group"
                  >
                    <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      <Layers className="text-blue-400" size={24} />
                    </div>
                    <span className="text-sm font-bold text-slate-200">2. Size Tag</span>
                    <span className="text-xs text-slate-500 mt-1">Close-up tag with size, brand, and origin</span>
                  </button>
                )}
              </div>

              {/* Slot 3: SKU & Weight */}
              <div className="relative">
                {step1Images.measurements ? (
                  <div className="relative h-44 rounded-xl border border-slate-800 overflow-hidden bg-slate-900 group">
                    <img 
                      src={URL.createObjectURL(step1Images.measurements)} 
                      alt="Measurements preview" 
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent p-3.5 flex items-end justify-between">
                      <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 font-sans">
                        <Scale size={14} className="text-blue-400" />
                        3. SKU & Weight
                      </span>
                      <button 
                        onClick={() => removeImage('measurements')}
                        className="p-1.5 bg-black/60 hover:bg-red-600/80 text-white rounded-lg transition-colors border border-white/10"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => triggerCamera('measurements')}
                    className="w-full h-40 border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-900/40 hover:bg-slate-900/80 rounded-xl flex flex-col items-center justify-center p-4 transition-all group cursor-pointer"
                  >
                    <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                      <Scale className="text-blue-400" size={24} />
                    </div>
                    <span className="text-sm font-bold text-slate-200">3. SKU & Weight</span>
                    <span className="text-xs text-slate-500 mt-1 font-sans">Barcode SKU and shipping scale reading</span>
                  </button>
                )}
              </div>

            </div>

            {/* Step 1 Actions */}
            <div className="pt-4 mt-auto">
              <button 
                onClick={handleSendToAI}
                disabled={!isStep1Complete}
                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-all text-base shadow-xl border cursor-pointer ${
                  isStep1Complete 
                    ? 'bg-blue-500 hover:bg-blue-600 text-white border-blue-600 shadow-blue-500/20 active:scale-[0.99]' 
                    : 'bg-slate-900 text-slate-500 border-slate-800 opacity-60 cursor-not-allowed'
                }`}
              >
                <Sparkles size={20} className={isStep1Complete ? "animate-pulse" : ""} />
                Send to AI (Start Processing)
              </button>
            </div>
          </div>
        )}

        {/* Phase 2: AI Background running & Detail captures */}
        {phase === 2 && (
          <div className="space-y-6 flex-1 flex flex-col">
            
            {/* Top background processing banner */}
            <div className="bg-slate-900/60 backdrop-blur border border-slate-800/80 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-3">
                {step1Status === 'processing' || step1Status === 'uploading' ? (
                  <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0 border border-blue-500/20">
                    <RefreshCw className="text-blue-400 animate-spin" size={18} />
                  </div>
                ) : step1Status === 'success' ? (
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center flex-shrink-0 border border-green-500/20">
                    <CheckCircle2 className="text-green-400" size={20} />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0 border border-red-500/20">
                    <AlertCircle className="text-red-400 animate-pulse" size={20} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-white">AI Processing Status</h3>
                    {step1Status === 'processing' && (
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Running
                      </span>
                    )}
                    {step1Status === 'success' && (
                      <span className="text-[10px] bg-green-500/20 text-green-300 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Extracted
                      </span>
                    )}
                    {step1Status === 'error' && (
                      <span className="text-[10px] bg-red-500/20 text-red-300 font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                        Failed
                      </span>
                    )}
                  </div>
                  
                  {/* Status text rotating */}
                  <p className="text-xs text-slate-400 mt-1 font-medium truncate h-4">
                    {step1Status === 'uploading' && "Uploading first 3 photos..."}
                    {step1Status === 'processing' && AI_STATUS_MESSAGES[statusMessageIndex]}
                    {step1Status === 'success' && `Ready! Draft #${draftId} created.`}
                    {step1Status === 'error' && (errorMessage || "An error occurred during AI extraction.")}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className={`h-full transition-all duration-500 ease-out rounded-full ${
                    step1Status === 'error' ? 'bg-red-500' : step1Status === 'success' ? 'bg-green-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${simulatedProgress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-semibold uppercase">
                <span>Upload</span>
                <span>AI Parsing</span>
                <span>Finished</span>
              </div>
            </div>

            {/* Error display with Retry option */}
            {step1Status === 'error' && (
              <div className="p-4 bg-red-950/20 border border-red-900/40 rounded-xl flex flex-col gap-3">
                <p className="text-xs text-red-400 font-medium">
                  {errorMessage || "The backend was unable to parse the images with Ollama. Make sure Ollama has the vision model loaded."}
                </p>
                <div className="flex gap-2">
                  <button 
                    onClick={handleSendToAI}
                    className="flex-1 bg-red-900/40 hover:bg-red-900/60 border border-red-800 text-red-200 font-bold text-xs py-2 px-3 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw size={14} />
                    Retry Step 1
                  </button>
                  <button 
                    onClick={handleReset}
                    className="bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs py-2 px-3 rounded-lg transition-colors cursor-pointer"
                  >
                    Start Over
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Snap additional detail photos */}
            <div className="space-y-4 flex-1">
              <div className="space-y-1">
                <h3 className="text-xl font-serif font-bold text-white flex items-center gap-2">
                  Snap Detail Photos
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Take up to 7 additional detail photos (tags, seam labels, wear, design details) while the AI processes.
                </p>
              </div>

              {/* Photo grid */}
              <div className="grid grid-cols-3 gap-3 py-2">
                
                {/* Snapped photos */}
                {additionalImages.map((file, idx) => (
                  <div key={idx} className="relative aspect-square rounded-xl border border-slate-800 overflow-hidden bg-slate-900/80 group">
                    <img 
                      src={URL.createObjectURL(file)} 
                      alt={`Detail ${idx + 1}`} 
                      className="w-full h-full object-cover"
                    />
                    <button 
                      onClick={() => removeAdditionalImage(idx)}
                      className="absolute top-1.5 right-1.5 p-1 bg-black/60 text-slate-300 hover:text-white rounded-md transition-colors border border-white/5 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                    <span className="absolute bottom-1.5 left-1.5 text-[9px] bg-black/75 px-1.5 py-0.5 rounded text-slate-300 font-bold">
                      #{idx + 1}
                    </span>
                  </div>
                ))}

                {/* Add Photo Trigger Card */}
                {additionalImages.length < 7 && (
                  <button 
                    onClick={triggerAdditionalCamera}
                    className="aspect-square border-2 border-dashed border-slate-800 hover:border-blue-500/40 bg-slate-900/20 hover:bg-slate-900/50 rounded-xl flex flex-col items-center justify-center p-2 transition-all group cursor-pointer"
                  >
                    <div className="w-9 h-9 bg-blue-500/5 rounded-lg flex items-center justify-center mb-1 group-hover:scale-105 transition-transform border border-blue-500/10">
                      <Plus className="text-blue-400" size={18} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-300">Add Photo</span>
                    <span className="text-[8px] text-slate-500 mt-0.5">{additionalImages.length}/7 snapped</span>
                  </button>
                )}

              </div>
            </div>

            {/* Step 2 Actions */}
            <div className="pt-4 mt-auto space-y-3">
              {step1Status === 'success' ? (
                <button 
                  onClick={handleUploadRemaining}
                  disabled={step2Status === 'uploading'}
                  className="w-full py-4 bg-green-600 hover:bg-green-700 text-white border-green-700 rounded-xl font-bold flex items-center justify-center gap-2.5 transition-all text-base shadow-xl border cursor-pointer active:scale-[0.99]"
                >
                  {step2Status === 'uploading' ? (
                    <>
                      <RefreshCw size={20} className="animate-spin" />
                      Uploading Details...
                    </>
                  ) : additionalImages.length > 0 ? (
                    <>
                      <CheckCircle2 size={20} />
                      Upload {additionalImages.length} Details & Finish
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={20} />
                      Complete Draft
                    </>
                  )}
                </button>
              ) : (
                <button 
                  disabled
                  className="w-full py-4 bg-slate-900 text-slate-500 border-slate-800 rounded-xl font-semibold flex items-center justify-center gap-2.5 transition-all text-base border cursor-not-allowed opacity-60"
                >
                  <RefreshCw size={18} className="animate-spin" />
                  AI Analysis Running...
                </button>
              )}

              {step1Status !== 'success' && additionalImages.length > 0 && (
                <p className="text-[11px] text-center text-slate-500 font-medium">
                  💡 Snapped {additionalImages.length} detail {additionalImages.length === 1 ? 'photo' : 'photos'}. They will be uploaded once AI finishes parsing.
                </p>
              )}
            </div>

          </div>
        )}

        {/* Phase 3: Success Screen */}
        {phase === 3 && aiResult && (
          <div className="space-y-6 flex-1 flex flex-col">
            
            {/* Success card */}
            <div className="text-center space-y-4 py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 text-green-400 relative">
                <CheckCircle2 size={36} />
                <div className="absolute inset-0 rounded-full border border-green-500/20 animate-ping opacity-75"></div>
              </div>
              
              <div className="space-y-1">
                <h2 className="text-2xl font-serif font-bold text-white">
                  {aiResult.status === 'processing' ? 'Item Queue Success!' : 'Item Draft Created!'}
                </h2>
                <p className="text-xs text-slate-400 font-medium font-sans">
                  {aiResult.status === 'processing' 
                    ? `Draft ID: #${draftId} • Saved to queue for background analysis` 
                    : `Draft ID: #${draftId} • Successfully saved to SQLite db`}
                </p>
              </div>
            </div>

            {/* Extracted Details Summary or Background Notice */}
            {aiResult.status === 'processing' ? (
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 text-center space-y-4 relative overflow-hidden">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mx-auto text-blue-400">
                  <RefreshCw className="animate-spin" size={24} />
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-serif font-bold text-white">AI Analysis Running in Background</h3>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto font-sans">
                    The Big Three photos are successfully uploaded and are being processed by the visual AI agent.
                  </p>
                  <p className="text-[11px] text-blue-400/90 font-semibold font-sans mt-2">
                    The Big Three are being analyzed. You can start your next item immediately while the server finishes extracting details!
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900/60 border border-slate-850 rounded-xl p-5 space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-800/80 pb-2">
                  AI Extracted Summary
                </h3>
                
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Suggested Title</label>
                    <p className="text-sm font-semibold text-white mt-0.5 leading-tight">{aiResult.title || "N/A"}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Brand</label>
                      <p className="text-sm font-bold text-slate-200 mt-0.5">{aiResult.brand || "N/A"}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Category</label>
                      <p className="text-sm font-bold text-slate-200 mt-0.5">{aiResult.category || "N/A"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Condition</label>
                      <p className="text-xs font-medium text-slate-300 mt-0.5 truncate">{aiResult.condition || "N/A"}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Material</label>
                      <p className="text-xs font-medium text-slate-300 mt-0.5 truncate">{aiResult.material || "N/A"}</p>
                    </div>
                  </div>

                  {aiResult.measurements_note && (
                    <div>
                      <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Measurements Note</label>
                      <p className="text-xs text-slate-400 mt-0.5 italic leading-snug">{aiResult.measurements_note}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Images Grid Attached */}
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                Images Saved ({aiResult.images?.length || 0} Total)
              </h3>
              
              <div className="flex gap-2 overflow-x-auto py-1 scrollbar-thin scrollbar-thumb-slate-800">
                {aiResult.images?.map((imgPath: string, idx: number) => {
                  // Resolve correct static URL for display
                  const url = imgPath.startsWith('http') 
                    ? imgPath 
                    : `${window.location.origin}/${imgPath.replace(/\\/g, '/')}`;
                  return (
                    <div key={idx} className="w-16 h-16 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden flex-shrink-0">
                      <img src={url} alt={`Saved file ${idx}`} className="w-full h-full object-cover" />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Finish Actions */}
            <div className="pt-4 mt-auto space-y-3">
              <button 
                onClick={handleReset}
                className="w-full py-4 bg-blue-500 hover:bg-blue-600 border-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xl border cursor-pointer active:scale-[0.99] transition-all text-base"
              >
                <Plus size={20} />
                Start Next Item
              </button>
              <button 
                onClick={() => navigate('/')}
                className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-xl font-bold text-sm transition-colors cursor-pointer"
              >
                Go to Dashboard
              </button>
            </div>
            
          </div>
        )}

      </main>
    </div>
  );
}
