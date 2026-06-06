import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  MapPin, Plus, Trash2, Check, Navigation, Sparkles, 
  TrendingUp, Camera, Compass, RotateCw, Map as MapIcon, 
  ListOrdered, Calendar, BarChart3, AlertCircle, ArrowUp, ArrowDown, ExternalLink
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const API_BASE = '/api';

interface ProspectLocation {
  id: number;
  name: string;
  type: 'thrift' | 'yard_sale' | 'auction' | 'other';
  address: string;
  latitude: number | null;
  longitude: number | null;
  notes: string;
  day_of_week: string;
}

interface SourcingAnalytic {
  locationId: number;
  locationName: string;
  locationType: string;
  locationAddress: string;
  totalItems: number;
  activeItems: number;
  soldItems: number;
  totalSpend: number;
  totalRevenue: number;
  avgDaysToSell: number;
  roi: number;
  netProfit: number;
}

const ThriftProspector: React.FC = () => {
  const [locations, setLocations] = useState<ProspectLocation[]>([]);
  const [analytics, setAnalytics] = useState<SourcingAnalytic[]>([]);
  const [activeTab, setActiveTab] = useState<'map' | 'analytics' | 'comps'>('map');
  const [loading, setLoading] = useState(true);
  
  // Route planning state
  const [routeStops, setRouteStops] = useState<ProspectLocation[]>([]);
  const [userCoords, setUserCoords] = useState<{lat: number; lng: number} | null>(null);
  const [startOverride, setStartOverride] = useState('');
  const [startOverrideLabel, setStartOverrideLabel] = useState('');
  const [isSettingStart, setIsSettingStart] = useState(false);
  const [startError, setStartError] = useState('');
  
  // Form state
  const [isAddingLoc, setIsAddingLoc] = useState(false);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'thrift' | 'yard_sale' | 'auction' | 'other'>('thrift');
  const [formAddress, setFormAddress] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formDay, setFormDay] = useState('Everyday');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState('');


  // Photo lookup state
  const [compPhoto, setCompPhoto] = useState<File | null>(null);
  const [compPreview, setCompPreview] = useState<string | null>(null);
  const [isAnalyzingComp, setIsAnalyzingComp] = useState(false);
  const [generatedQuery, setGeneratedQuery] = useState('');

  // Map reference
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersGroupRef = useRef<L.FeatureGroup | null>(null);

  const fetchLocations = async () => {
    try {
      const res = await axios.get(`${API_BASE}/prospecting/locations`);
      setLocations(res.data);
    } catch (err) {
      console.error('Failed to load locations', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await axios.get(`${API_BASE}/prospecting/analytics`);
      setAnalytics(res.data);
    } catch (err) {
      console.error('Failed to load analytics', err);
    }
  };

  const handleSetStartOverride = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!startOverride.trim()) return;
    
    setIsSettingStart(true);
    setStartError('');
    
    try {
      const query = encodeURIComponent(startOverride.trim());
      const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`);
      if (geoRes.data && geoRes.data.length > 0) {
        const lat = parseFloat(geoRes.data[0].lat);
        const lng = parseFloat(geoRes.data[0].lon);
        setUserCoords({ lat, lng });
        const namePart = geoRes.data[0].display_name.split(',')[0];
        setStartOverrideLabel(namePart || startOverride.trim());
      } else {
        setStartError('Could not find location coordinates for that address or ZIP code.');
      }
    } catch (err) {
      console.error('Failed to geocode start address:', err);
      setStartError('Failed to locate address. Check your network connection.');
    } finally {
      setIsSettingStart(false);
    }
  };

  const handleClearOverride = () => {
    setStartOverride('');
    setStartOverrideLabel('');
    setStartError('');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
        },
        (err) => {
          console.log('Geolocation permission denied or unavailable.', err);
          setUserCoords(null);
        }
      );
    } else {
      setUserCoords(null);
    }
  };

  useEffect(() => {
    const initData = async () => {
      setLoading(true);
      await Promise.all([fetchLocations(), fetchAnalytics()]);
      setLoading(false);
    };
    initData();
    
    // Get user geolocation if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          });
        },
        () => console.log('Geolocation permission denied or unavailable.')
      );
    }
  }, []);

  // Map rendering effect
  useEffect(() => {
    if (activeTab !== 'map' || loading || !mapContainerRef.current) return;

    // Destroy existing map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    // Default center around San Jose CA
    const defaultCenter: [number, number] = [37.295, -121.890];
    const mapCenter = userCoords ? [userCoords.lat, userCoords.lng] as [number, number] : defaultCenter;
    
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView(mapCenter, 12);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    mapInstanceRef.current = map;

    const markersGroup = L.featureGroup().addTo(map);
    markersGroupRef.current = markersGroup;

    // Add user marker if coordinates available
    if (userCoords) {
      const markerColor = startOverrideLabel ? '#8b5cf6' : '#3b82f6';
      const userMarkerHtml = `<span style="display:flex; justify-content:center; align-items:center; width:22px; height:22px; background-color:${markerColor}; border-radius:50%; border: 3px solid white; box-shadow: 0 0 10px ${markerColor}66; animate: pulse 2s infinite;"></span>`;
      L.marker([userCoords.lat, userCoords.lng], {
        icon: L.divIcon({
          html: userMarkerHtml,
          className: 'user-location-marker',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        })
      }).bindPopup(startOverrideLabel ? `Start: ${startOverrideLabel}` : 'Your Current Location').addTo(map);
    }

    // Color code pins by type
    const getMarkerColor = (type: string) => {
      switch (type) {
        case 'thrift': return '#10b981'; // green
        case 'yard_sale': return '#f97316'; // orange
        case 'auction': return '#a855f7'; // purple
        default: return '#64748b'; // gray
      }
    };

    // Add location markers
    locations.forEach(loc => {
      if (loc.latitude && loc.longitude) {
        const pinColor = getMarkerColor(loc.type);
        const pinHtml = `<span style="display:flex; justify-content:center; align-items:center; width:28px; height:28px; background-color:${pinColor}; border-radius:50% 50% 50% 0; transform:rotate(-45deg); border: 2px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                          <span style="transform:rotate(45deg); width:6px; height:6px; background-color:white; border-radius:50%;"></span>
                         </span>`;
                         
        const marker = L.marker([loc.latitude, loc.longitude], {
          icon: L.divIcon({
            html: pinHtml,
            className: 'custom-prospect-marker',
            iconSize: [28, 28],
            iconAnchor: [14, 28]
          })
        });

        const isAdded = routeStops.some(s => s.id === loc.id);
        const popupContent = document.createElement('div');
        popupContent.className = 'p-1 text-slate-800 space-y-1.5 min-w-[150px]';
        popupContent.innerHTML = `
          <p class="font-bold text-xs capitalize leading-tight">${loc.name}</p>
          <p class="text-[9px] text-slate-500 font-sans leading-snug">${loc.address}</p>
          <p class="text-[9px] text-slate-600 italic leading-snug">Note: ${loc.notes || 'None'}</p>
        `;
        
        const btn = document.createElement('button');
        btn.className = `w-full mt-2 py-1 text-[9px] font-bold uppercase rounded text-center transition-all cursor-pointer ${
          isAdded ? 'bg-red-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'
        }`;
        btn.innerText = isAdded ? 'Remove from Route' : 'Add to Route';
        btn.onclick = () => {
          toggleRouteStop(loc);
          map.closePopup();
        };
        
        popupContent.appendChild(btn);
        marker.bindPopup(popupContent);
        marker.addTo(markersGroup);
      }
    });

    // Fit map bounds to show all markers if any exist
    if (locations.some(l => l.latitude && l.longitude)) {
      try {
        map.fitBounds(markersGroup.getBounds(), { padding: [40, 40] });
      } catch (e) {
        // Fallback bounds
      }
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [activeTab, loading, locations, routeStops, userCoords, startOverrideLabel]);

  // Toggle location in planned route
  const toggleRouteStop = (loc: ProspectLocation) => {
    setRouteStops(prev => {
      const isAdded = prev.some(s => s.id === loc.id);
      if (isAdded) {
        return prev.filter(s => s.id !== loc.id);
      } else {
        return [...prev, loc];
      }
    });
  };

  // Reorder planned route stops (Up/Down)
  const moveStop = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === routeStops.length - 1) return;
    
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...routeStops];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;
    setRouteStops(reordered);
  };

  // Optimize Sourcing Route (Nearest Neighbor / TSP algorithm)
  const optimizeRoute = () => {
    if (routeStops.length < 2) return;
    
    const unvisited = [...routeStops];
    const optimized: ProspectLocation[] = [];
    
    // Start node is either user location (if available) or the first stop in the list
    let currentLat = userCoords?.lat;
    let currentLng = userCoords?.lng;

    if (!currentLat || !currentLng) {
      const first = unvisited.shift()!;
      optimized.push(first);
      currentLat = first.latitude || 0;
      currentLng = first.longitude || 0;
    }

    while (unvisited.length > 0) {
      let nearestIdx = -1;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const stop = unvisited[i];
        if (stop.latitude && stop.longitude) {
          // Simple Pythagorean distance approximation for local routing
          const dist = Math.sqrt(
            Math.pow(stop.latitude - currentLat, 2) + 
            Math.pow(stop.longitude - currentLng, 2)
          );
          if (dist < minDistance) {
            minDistance = dist;
            nearestIdx = i;
          }
        }
      }

      if (nearestIdx !== -1) {
        const nextStop = unvisited.splice(nearestIdx, 1)[0];
        optimized.push(nextStop);
        currentLat = nextStop.latitude || currentLat;
        currentLng = nextStop.longitude || currentLng;
      } else {
        // Fallback for markers without coords
        optimized.push(unvisited.shift()!);
      }
    }

    setRouteStops(optimized);
  };

  // Start Navigation in Google Maps
  const startNavigation = () => {
    if (routeStops.length === 0) return;
    
    const origin = userCoords ? `${userCoords.lat},${userCoords.lng}` : '';
    const stopsList = routeStops.filter(s => s.latitude && s.longitude);
    
    if (stopsList.length === 0) return;
    
    const destination = stopsList[stopsList.length - 1];
    const destCoords = `${destination.latitude},${destination.longitude}`;
    
    // Waypoints are intermediate stops (all stops except the last one)
    const waypoints = stopsList.slice(0, -1).map(s => `${s.latitude},${s.longitude}`).join('|');
    
    let url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destCoords)}`;
    if (origin) {
      url += `&origin=${encodeURIComponent(origin)}`;
    }
    if (waypoints) {
      url += `&waypoints=${encodeURIComponent(waypoints)}`;
    }
    
    window.open(url, '_blank');
  };

  // Handle geocoding and saving new location
  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;
    
    setIsGeocoding(true);
    setGeocodeError('');
    
    let lat: number | null = null;
    let lng: number | null = null;

    if (formAddress.trim()) {
      try {
        // Client-side geocoding utilizing OpenStreetMap Nominatim
        // Scoped to San Jose area if possible, or broad query
        const query = encodeURIComponent(formAddress);
        const geoRes = await axios.get(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`);
        if (geoRes.data && geoRes.data.length > 0) {
          lat = parseFloat(geoRes.data[0].lat);
          lng = parseFloat(geoRes.data[0].lon);
        } else {
          setGeocodeError('Could not find location coordinates on the map. Saving with mock center coordinates...');
          // Mock coordinates in San Jose CA for testing
          lat = 37.295 + (Math.random() * 0.08 - 0.04);
          lng = -121.890 + (Math.random() * 0.08 - 0.04);
        }
      } catch (err) {
        console.error('Geocoding error:', err);
        // Fallback coordinates
        lat = 37.295 + (Math.random() * 0.08 - 0.04);
        lng = -121.890 + (Math.random() * 0.08 - 0.04);
      }
    }

    try {
      const payload = {
        name: formName,
        type: formType,
        address: formAddress,
        latitude: lat,
        longitude: lng,
        notes: formNotes,
        day_of_week: formDay
      };
      
      const res = await axios.post(`${API_BASE}/prospecting/locations`, payload);
      setLocations(prev => [res.data, ...prev]);
      
      // Reset Form
      setFormName('');
      setFormAddress('');
      setFormNotes('');
      setFormDay('Everyday');
      setIsAddingLoc(false);
      fetchAnalytics(); // Refresh leaderboard data
    } catch (err) {
      alert('Failed to save location');
    } finally {
      setIsGeocoding(false);
    }
  };

  // Delete Location
  const handleDeleteLocation = async (id: number) => {
    if (!confirm('Are you sure you want to delete this sourcing location?')) return;
    try {
      await axios.delete(`${API_BASE}/prospecting/locations/${id}`);
      setLocations(prev => prev.filter(l => l.id !== id));
      setRouteStops(prev => prev.filter(s => s.id !== id));
      fetchAnalytics();
    } catch (err) {
      alert('Failed to delete location');
    }
  };

  // Photo Sold Comp Upload & Process
  const handleCompPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setCompPhoto(file);
      setCompPreview(URL.createObjectURL(file));
      setGeneratedQuery('');
    }
  };

  const runVisualCompSearch = async () => {
    if (!compPhoto) return;
    
    setIsAnalyzingComp(true);
    setGeneratedQuery('');
    
    const formData = new FormData();
    formData.append('image', compPhoto);
    
    try {
      const res = await axios.post(`${API_BASE}/prospecting/visual-comp`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const query = res.data.query;
      setGeneratedQuery(query);
      
      // Auto open eBay solds in new window
      const ebayUrl = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1&LH_Complete=1`;
      window.open(ebayUrl, '_blank');
    } catch (err) {
      console.error(err);
      alert('Failed to process image search comps');
    } finally {
      setIsAnalyzingComp(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sourcing Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-white/5 pb-4 gap-4">
        <div>
          <h2 className="font-serif text-2xl font-black text-slate-100 flex items-center gap-2.5">
            <Compass className="text-blue-500" size={24} />
            Thrift Sourcing & Route Planner
          </h2>
          <p className="text-[11px] text-slate-500 font-sans mt-1">Track thrift store performance, plan Saturday routes, and scan visual sold comps</p>
        </div>
        
        {/* Tab Selection */}
        <div className="bg-slate-950/40 p-1 rounded-xl border border-white/5 flex self-start">
          <button 
            onClick={() => setActiveTab('map')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'map' ? 'bg-blue-600 text-white' : 'text-slate-450 hover:text-slate-200'
            }`}
          >
            <MapIcon size={14} />
            Map & Route
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'analytics' ? 'bg-blue-600 text-white' : 'text-slate-450 hover:text-slate-200'
            }`}
          >
            <BarChart3 size={14} />
            Leaderboard
          </button>
          <button 
            onClick={() => setActiveTab('comps')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'comps' ? 'bg-blue-600 text-white' : 'text-slate-450 hover:text-slate-200'
            }`}
          >
            <Camera size={14} />
            Scan Comps
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 gap-4">
          <RotateCw className="animate-spin text-blue-500" size={32} />
          <p className="font-serif italic">Loading sourcing locations & geo data...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: MAP AND ROUTE PLANNER */}
          {activeTab === 'map' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              
              {/* Left Column (Sourcing locations directory) */}
              <div className="lg:col-span-5 space-y-6 flex flex-col h-full lg:max-h-[720px] overflow-y-auto pr-1">
                <div className="flex justify-between items-center pb-2">
                  <h3 className="font-serif text-base font-bold text-slate-250">Sourcing Locations</h3>
                  <button 
                    onClick={() => setIsAddingLoc(!isAddingLoc)}
                    className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] uppercase font-black tracking-wider rounded-lg transition-all flex items-center gap-1 cursor-pointer active:scale-95"
                  >
                    <Plus size={12} />
                    New Source
                  </button>
                </div>

                {/* Collapsible Add Location Form */}
                {isAddingLoc && (
                  <form onSubmit={handleAddLocation} className="glass-card p-4 space-y-4 border-blue-500/20 bg-blue-500/[0.01]">
                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                      <span className="text-xs font-bold text-slate-200">Add Sourcing Location</span>
                      <button 
                        type="button" 
                        onClick={() => setIsAddingLoc(false)}
                        className="text-[10px] text-slate-450 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Source Name</label>
                        <input 
                          type="text"
                          required
                          placeholder="e.g. Blossom Hill Goodwill..."
                          value={formName}
                          onChange={(e) => setFormName(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 outline-none text-xs text-slate-200 focus:border-blue-500/50"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Type</label>
                          <select
                            value={formType}
                            onChange={(e) => setFormType(e.target.value as any)}
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 outline-none text-xs text-slate-200 focus:border-blue-500/50"
                          >
                            <option value="thrift">Thrift Store</option>
                            <option value="yard_sale">Yard Sale</option>
                            <option value="auction">Auction / Estate</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Best Day</label>
                          <select
                            value={formDay}
                            onChange={(e) => setFormDay(e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 outline-none text-xs text-slate-200 focus:border-blue-500/50"
                          >
                            <option value="Everyday">Everyday</option>
                            <option value="Saturday">Saturday</option>
                            <option value="Sunday">Sunday</option>
                            <option value="Wednesday">Wednesday</option>
                            <option value="Friday">Friday</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Street Address</label>
                        <input 
                          type="text"
                          placeholder="e.g. 845 Blossom Hill Rd, San Jose, CA"
                          value={formAddress}
                          onChange={(e) => setFormAddress(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 outline-none text-xs text-slate-200 focus:border-blue-500/50"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] uppercase tracking-wider text-slate-500 font-bold block mb-1">Sourcing Notes / Strategy</label>
                        <textarea 
                          rows={2}
                          placeholder="What brands to look for? Tag discount schedule?"
                          value={formNotes}
                          onChange={(e) => setFormNotes(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg p-2.5 outline-none text-xs text-slate-200 focus:border-blue-500/50 font-sans"
                        />
                      </div>

                      {geocodeError && (
                        <p className="text-[10px] text-amber-400 flex items-center gap-1 font-semibold leading-snug">
                          <AlertCircle size={12} className="flex-shrink-0" />
                          {geocodeError}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={isGeocoding}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 text-white disabled:text-slate-500 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isGeocoding ? (
                          <>
                            <RotateCw className="animate-spin" size={14} />
                            Geocoding Address...
                          </>
                        ) : (
                          <>
                            <Check size={14} />
                            Save Location
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* Sourcing Location Directory list */}
                <div className="space-y-4">
                  {locations.length === 0 ? (
                    <div className="text-center py-10 text-slate-500 glass-card">
                      <MapPin className="mx-auto mb-2 opacity-20" size={32} />
                      <p className="text-xs">No sourcing locations saved yet.</p>
                    </div>
                  ) : (
                    locations.map(loc => {
                      const isAdded = routeStops.some(s => s.id === loc.id);
                      
                      let typeColor = 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                      if (loc.type === 'thrift') typeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                      if (loc.type === 'yard_sale') typeColor = 'bg-orange-500/10 text-orange-400 border-orange-500/20';
                      if (loc.type === 'auction') typeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/20';

                      return (
                        <div 
                          key={loc.id} 
                          className={`p-4 bg-slate-950/40 border rounded-xl hover:border-slate-800 transition-all flex flex-col justify-between gap-4 text-left ${
                            isAdded ? 'border-blue-500/30 bg-blue-500/[0.01]' : 'border-white/5'
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border ${typeColor}`}>
                                {loc.type === 'yard_sale' ? 'yard sale' : loc.type}
                              </span>
                              <span className="text-[9px] font-mono text-slate-500 font-bold flex items-center gap-0.5">
                                <Calendar size={10} />
                                {loc.day_of_week}
                              </span>
                            </div>
                            <h4 className="text-xs font-extrabold text-slate-200 truncate pt-1">{loc.name}</h4>
                            <p className="text-[10px] text-slate-500 truncate font-sans">{loc.address || 'No address provided'}</p>
                            {loc.notes && (
                              <p className="text-[10px] text-slate-400 font-sans italic leading-snug pt-1">"{loc.notes}"</p>
                            )}
                          </div>

                          <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
                            <button
                              onClick={() => handleDeleteLocation(loc.id)}
                              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                              title="Delete location"
                            >
                              <Trash2 size={13} />
                            </button>
                            <button
                              onClick={() => toggleRouteStop(loc)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                                isAdded 
                                  ? 'bg-blue-500/25 border border-blue-500/30 text-blue-400' 
                                  : 'bg-slate-900 border border-white/5 hover:bg-slate-800 text-slate-300'
                              }`}
                            >
                              {isAdded ? 'Added' : 'Add to Route'}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column (Map and Planned Route Checklist) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Embedded Leaflet Map */}
                <div className="glass-card overflow-hidden border border-white/5 relative z-10">
                  <div className="p-3 bg-slate-950/40 border-b border-white/5 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-350 flex items-center gap-1.5">
                      <MapIcon size={14} className="text-blue-500" />
                      Sourcing Map ({locations.filter(l => l.latitude).length} pins loaded)
                    </span>
                    {userCoords && (
                      <span className="text-[9px] text-blue-400 font-mono font-bold flex items-center gap-1">
                        <Navigation size={10} className="animate-pulse" />
                        Live GPS Active
                      </span>
                    )}
                  </div>
                  <div 
                    ref={mapContainerRef} 
                    className="h-[300px] md:h-[380px] w-full bg-slate-900 z-10" 
                  />
                </div>

                {/* Planned Route Checklist Card */}
                <div className="glass-card p-6 border-blue-500/20 bg-blue-500/[0.01]">
                  <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-3 gap-3">
                    <div>
                      <h3 className="font-serif text-base font-bold text-slate-100 flex items-center gap-2">
                        <ListOrdered size={16} className="text-blue-500" />
                        Saturday Sourcing Route ({routeStops.length} stops)
                      </h3>
                      <p className="text-[10px] text-slate-500 font-sans mt-0.5">Order of stores for your next garage sale/thrift haul</p>
                    </div>

                    <div className="flex gap-2 self-start md:self-auto">
                      <button
                        onClick={optimizeRoute}
                        disabled={routeStops.length < 2}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 border border-white/10 hover:border-blue-500/30 text-blue-400 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <Sparkles size={11} />
                        Optimize Order
                      </button>
                      <button
                        onClick={startNavigation}
                        disabled={routeStops.length === 0}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-lg shadow-blue-500/10 active:scale-95"
                      >
                        <Navigation size={11} />
                        GPS Navigation
                      </button>
                    </div>
                  </div>

                  {/* Start Location Override Form */}
                  <div className="mt-4 p-3.5 bg-slate-950/40 rounded-xl border border-white/5 space-y-2 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 flex items-center gap-1.5">
                        <MapPin size={12} className={startOverrideLabel ? "text-purple-400" : "text-blue-400"} />
                        Starting Location: {startOverrideLabel ? 'Custom ZIP/Address' : 'Browser Geolocation'}
                      </span>
                      {userCoords ? (
                        <span className="text-[9px] font-mono text-slate-500">
                          ({userCoords.lat.toFixed(4)}, {userCoords.lng.toFixed(4)})
                        </span>
                      ) : (
                        <span className="text-[9px] text-amber-500 font-medium">Using San Jose default center</span>
                      )}
                    </div>

                    <form onSubmit={handleSetStartOverride} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter ZIP code or start address (e.g. 95123)..."
                        value={startOverride}
                        onChange={(e) => setStartOverride(e.target.value)}
                        className="flex-1 bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 outline-none text-xs text-slate-200 focus:border-blue-500/50 font-sans"
                      />
                      <button
                        type="submit"
                        disabled={isSettingStart || !startOverride.trim()}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 text-white disabled:text-slate-500 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        {isSettingStart ? <RotateCw className="animate-spin" size={12} /> : 'Set'}
                      </button>
                      {(startOverrideLabel || userCoords) && (
                        <button
                          type="button"
                          onClick={handleClearOverride}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 hover:text-white rounded-lg text-xs transition-all cursor-pointer active:scale-95"
                          title="Reset to default GPS"
                        >
                          Reset
                        </button>
                      )}
                    </form>

                    {startOverrideLabel && (
                      <p className="text-[10px] text-emerald-400 font-sans flex items-center gap-1">
                        <Check size={11} />
                        Starting route from: <strong className="text-slate-200 font-semibold">{startOverrideLabel}</strong>
                      </p>
                    )}
                    {startError && (
                      <p className="text-[10px] text-amber-400 font-sans flex items-center gap-1 font-semibold leading-snug">
                        <AlertCircle size={11} className="flex-shrink-0" />
                        {startError}
                      </p>
                    )}
                  </div>

                  {/* Stops List */}
                  <div className="py-4 space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {routeStops.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
                        <AlertCircle size={28} className="opacity-20" />
                        <p className="text-xs">No stops added. Add thrift stores from the directory or tap pins on the map.</p>
                      </div>
                    ) : (
                      routeStops.map((stop, idx) => {
                        let badgeColor = 'bg-slate-500/10 text-slate-400';
                        if (stop.type === 'thrift') badgeColor = 'bg-emerald-500/10 text-emerald-400';
                        if (stop.type === 'yard_sale') badgeColor = 'bg-orange-500/10 text-orange-400';
                        if (stop.type === 'auction') badgeColor = 'bg-purple-500/10 text-purple-400';

                        return (
                          <div key={stop.id} className="p-3 bg-slate-950/40 border border-white/5 rounded-xl flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-[10px] font-mono font-bold text-blue-400">
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-slate-200 truncate">{stop.name}</h4>
                                <p className="text-[9px] text-slate-500 truncate font-sans">{stop.address}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border border-white/[0.02] ${badgeColor}`}>
                                {stop.type === 'yard_sale' ? 'yard sale' : stop.type}
                              </span>
                              
                              {/* Up/Down buttons for mobile reordering */}
                              <div className="flex flex-col border border-white/5 rounded-lg overflow-hidden bg-slate-900">
                                <button 
                                  onClick={() => moveStop(idx, 'up')}
                                  disabled={idx === 0}
                                  className="p-1 hover:bg-slate-800 text-slate-450 hover:text-white disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp size={10} />
                                </button>
                                <button 
                                  onClick={() => moveStop(idx, 'down')}
                                  disabled={idx === routeStops.length - 1}
                                  className="p-1 hover:bg-slate-800 border-t border-white/5 text-slate-450 hover:text-white disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown size={10} />
                                </button>
                              </div>

                              <button
                                onClick={() => toggleRouteStop(stop)}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                                title="Remove stop"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* TAB 2: SOURCING PERFORMANCE LEADERBOARD */}
          {activeTab === 'analytics' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-3 shadow-lg max-w-4xl text-left">
                <TrendingUp className="text-blue-500 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-xs space-y-1">
                  <span className="font-bold text-slate-200 block">Sourcing Analytics & ROI Leaderboard</span>
                  <span className="text-slate-400 font-sans leading-relaxed block">
                    This rankings leaderboard aggregates all drafts, active listings, and sold orders. Sourced locations are automatically ranked by <strong>Net Profit</strong> and <strong>ROI (Return on Investment)</strong>, enabling you to optimize where you spend your weekend sourcing budgets.
                  </span>
                </div>
              </div>

              {/* Leaderboard Cards / Table */}
              <div className="space-y-4 max-w-5xl">
                {analytics.map((item, idx) => {
                  let badgeColor = 'bg-slate-500/10 text-slate-400';
                  if (item.locationType === 'thrift') badgeColor = 'bg-emerald-500/10 text-emerald-400';
                  if (item.locationType === 'yard_sale') badgeColor = 'bg-orange-500/10 text-orange-400';
                  if (item.locationType === 'auction') badgeColor = 'bg-purple-500/10 text-purple-400';

                  return (
                    <div 
                      key={item.locationId} 
                      className="glass-card p-5 border border-white/5 relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-blue-500/10 transition-all text-left"
                    >
                      {/* Left Block (Rank and Name) */}
                      <div className="flex items-center gap-4 min-w-0">
                        <span className="text-xl font-serif font-black text-slate-500 w-6">
                          #{idx + 1}
                        </span>
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-100 truncate">{item.locationName}</span>
                            <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider border border-white/[0.02] ${badgeColor}`}>
                              {item.locationType === 'yard_sale' ? 'yard sale' : item.locationType}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate font-sans">{item.locationAddress || 'No address registered'}</p>
                          <p className="text-[9px] text-slate-450 font-sans">
                            Total items sourced: <strong>{item.totalItems}</strong> • Active listings: <strong>{item.activeItems}</strong> • Sold items: <strong>{item.soldItems}</strong>
                          </p>
                        </div>
                      </div>

                      {/* Right Block (Financial Performance) */}
                      <div className="grid grid-cols-2 md:flex items-center gap-4 md:gap-8 pr-1 font-mono">
                        {/* Cost / Revenue */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Spend vs Sold</span>
                          <span className="text-xs text-slate-300 font-bold">
                            ${item.totalSpend.toFixed(2)} / <span className="text-green-400">${item.totalRevenue.toFixed(2)}</span>
                          </span>
                        </div>

                        {/* Average Days to Sell */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Avg Days to Sell</span>
                          <span className="text-xs text-slate-300 font-bold">
                            {item.avgDaysToSell} days
                          </span>
                        </div>

                        {/* ROI */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Est. ROI</span>
                          <span className="text-xs text-blue-400 font-bold">
                            +{item.roi.toFixed(1)}%
                          </span>
                        </div>

                        {/* Net Profit */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 font-bold font-sans">Net profit</span>
                          <span className="text-sm text-green-400 font-bold">
                            +${item.netProfit.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: SNAP AND SEARCH COMPS */}
          {activeTab === 'comps' && (
            <div className="max-w-xl mx-auto glass-card p-6 md:p-8 space-y-6 border-blue-500/20 bg-blue-500/[0.01]">
              <div className="text-center space-y-2">
                <Camera size={40} className="mx-auto text-blue-500 animate-pulse" />
                <h3 className="font-serif text-lg font-bold text-slate-100">Visual Sold Comps Lookup</h3>
                <p className="text-xs text-slate-500 font-sans leading-relaxed">
                  Snap a photo of an item at a thrift store or yard sale. Our local visual AI agent will describe the item and instantly search eBay's Sold comp archives to help you determine its resell value before you buy!
                </p>
              </div>

              {/* Photo Snapping Zone */}
              <div className="space-y-4">
                <div className="flex justify-center">
                  {compPreview ? (
                    <div className="relative w-full aspect-square max-w-[280px] rounded-2xl overflow-hidden border border-white/10 bg-slate-900 group">
                      <img 
                        src={compPreview} 
                        alt="Prospect item" 
                        className="w-full h-full object-cover" 
                      />
                      <button 
                        onClick={() => {
                          setCompPhoto(null);
                          setCompPreview(null);
                          setGeneratedQuery('');
                        }}
                        className="absolute top-3 right-3 p-1.5 bg-black/60 hover:bg-black text-white rounded-lg text-[9px] uppercase tracking-wider font-bold transition-all cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  ) : (
                    <label className="w-full aspect-square max-w-[280px] rounded-2xl border-2 border-dashed border-white/10 hover:border-blue-500/40 bg-slate-950/40 hover:bg-slate-900/10 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all p-6 text-center">
                      <input 
                        type="file" 
                        accept="image/*" 
                        capture="environment" 
                        className="hidden" 
                        onChange={compPhotoChangeHandler}
                      />
                      <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-all">
                        <Camera size={22} />
                      </div>
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-slate-200 block">Capture Photo</span>
                        <span className="text-[9px] text-slate-500 font-sans block">Tap to open camera or upload file</span>
                      </div>
                    </label>
                  )}
                </div>

                {/* Submit button */}
                {compPhoto && (
                  <button
                    onClick={runVisualCompSearch}
                    disabled={isAnalyzingComp}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 text-white disabled:text-slate-500 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-blue-500/10 active:scale-95"
                  >
                    {isAnalyzingComp ? (
                      <>
                        <RotateCw className="animate-spin" size={16} />
                        Visual AI Analyzing Item...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Search Sold Comps
                      </>
                    )}
                  </button>
                )}

                {/* Analysis Query Output */}
                {generatedQuery && (
                  <div className="p-4 bg-slate-950/40 border border-white/5 rounded-xl text-left space-y-2">
                    <span className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block">Generated eBay Query</span>
                    <p className="text-xs font-bold text-slate-200 italic">"{generatedQuery}"</p>
                    <a 
                      href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(generatedQuery)}&LH_Sold=1&LH_Complete=1`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 font-bold pt-1.5"
                    >
                      <ExternalLink size={12} />
                      Re-open eBay Sold Listings
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  // Wrapper for input change to work with TS
  function compPhotoChangeHandler(e: React.ChangeEvent<HTMLInputElement>) {
    handleCompPhotoChange(e);
  }
};

export default ThriftProspector;
