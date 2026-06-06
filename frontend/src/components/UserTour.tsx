import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, ChevronRight, ChevronLeft, X } from 'lucide-react';

interface UserTourProps {
  isOpen: boolean;
  onClose: () => void;
  userRole?: 'admin' | 'user';
}

interface TourStep {
  title: string;
  description: string;
  route: string;
  highlightLabel?: string;
}

const UserTour: React.FC<UserTourProps> = ({ isOpen, onClose, userRole }) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);

  const tourSteps: TourStep[] = [
    {
      title: "Welcome to MarketMaven! 🌟",
      description: "Let's take a quick 2-minute tour to walk you through your new resell assistant and sourcing workspace.",
      route: "/"
    },
    {
      title: "Inventory Dashboard & AI Drafts",
      description: "This is your main Hub. Here you can see active listings and drafts. Click 'Edit Details' on any draft to assign its sourcing location and purchase cost.",
      route: "/"
    },
    {
      title: "Live Sales Telemetry",
      description: "The Sales Dashboard provides a unified telemetry hub: track your total sales, active listings counts, and order statistics in real-time.",
      route: "/sales"
    },
    {
      title: "eBay Inventory Integration",
      description: "Manage your live eBay listings directly from the app. You can update pricing, description specifics, or end listings instantly.",
      route: "/ebay"
    },
    {
      title: "Sourcing Discover & Local Deals",
      description: "Type in a starting ZIP code or address to discover local yard sales, auctions, and thrift store deals from Craigslist, Facebook Marketplace, and KSL Classifieds.",
      route: "/prospecting"
    },
    {
      title: "Interactive Sourcing Routes",
      description: "Save sourcing locations as map pins. Check off stores to compile a weekend route, optimize the stops using our Travelling Salesperson algorithm, and load it in Google Maps.",
      route: "/prospecting"
    },
    {
      title: "Visual eBay Sold Lookups",
      description: "Snap a photo of tags or labels using the camera capture utility. The local visual AI identifies the model/brand, generates optimal keywords, and redirects to eBay sold history.",
      route: "/prospecting"
    },
    {
      title: "Sourcing Analytics Leaderboard",
      description: "Track which thrift stores or estate sales yield the highest ROI and net profit. Use these rankings to focus your sourcing capital on high-yield hubs.",
      route: "/prospecting"
    }
  ];

  if (userRole === 'admin') {
    tourSteps.push({
      title: "Admin Control Center",
      description: "Manage test users, toggle global public registration settings to lock down registrations, promote administrators, and resolve wife-submitted feedback tickets.",
      route: "/admin"
    });
  }

  tourSteps.push({
    title: "You're Ready to Rock! 🚀",
    description: "That completes the walkthrough. Submit suggestions anytime via the 'Wife's Feedback Box' in the menu sidebar. Happy sourcing!",
    route: "/"
  });

  // Automatically navigate when the step changes
  useEffect(() => {
    if (isOpen && tourSteps[currentStep]) {
      navigate(tourSteps[currentStep].route);
    }
  }, [currentStep, isOpen]);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = () => {
    localStorage.setItem('mm_tour_completed', 'true');
    setCurrentStep(0);
    onClose();
  };

  if (!isOpen) return null;

  const step = tourSteps[currentStep];

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-end justify-center md:justify-end p-4 md:p-8">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="pointer-events-auto w-full max-w-sm glass-card border border-blue-500/20 p-5 shadow-2xl relative space-y-4 text-left"
        >
          {/* Top header decoration */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-1.5 text-blue-400 font-sans text-[10px] font-black uppercase tracking-widest">
              <Compass className="animate-spin-slow" size={14} />
              <span>Guided Tour</span>
            </div>
            <button
              onClick={handleComplete}
              className="p-1 hover:bg-white/5 rounded-lg text-slate-500 hover:text-slate-350 transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Step content */}
          <div className="space-y-1.5">
            <h4 className="font-serif text-sm font-bold text-slate-100 flex items-center gap-1.5">
              {step.title}
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              {step.description}
            </p>
          </div>

          {/* Progress and controls */}
          <div className="pt-3 border-t border-white/5 flex items-center justify-between font-sans">
            <div className="text-[10px] text-slate-550 font-bold">
              {currentStep + 1} of {tourSteps.length}
            </div>

            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={handleBack}
                  className="px-2.5 py-1.5 bg-slate-900/40 border border-white/5 hover:bg-slate-950 text-slate-350 rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-0.5 active:scale-95"
                >
                  <ChevronLeft size={12} />
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-[10px] font-bold transition-all cursor-pointer flex items-center gap-0.5 shadow-lg shadow-blue-600/10 active:scale-95"
              >
                {currentStep === tourSteps.length - 1 ? (
                  <span>Get Sourcing</span>
                ) : (
                  <>
                    <span>Next</span>
                    <ChevronRight size={12} />
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default UserTour;
