import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Search, Edit2, Trash2, CheckSquare, Square, RefreshCcw, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = '/api';

interface InventoryItem {
  sku: string;
  listingId?: string;
  product: {
    title: string;
    description?: string;
    aspects?: Record<string, string[]>;
    imageUrls?: string[];
  };
  condition: string;
  availability: {
    shipToLocationAvailability: {
      quantity: number;
    };
  };
  isTraditional?: boolean;
  status?: string;
}

const COMMON_COUNTRIES = [
  "United States",
  "Vietnam",
  "China",
  "Bangladesh",
  "India",
  "Mexico",
  "Indonesia",
  "Cambodia",
  "Honduras",
  "El Salvador",
  "Pakistan",
  "Italy",
  "Turkey",
  "Sri Lanka",
  "Philippines",
  "Nicaragua",
  "Thailand",
  "Canada",
  "Egypt",
  "Guatemala",
  "Peru",
  "Madagascar",
  "Dominican Republic",
  "Unknown"
];

const COMMON_SIZES = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
  '0', '2', '4', '6', '8', '10', '12', '14', '16', '18', '20',
  '28', '29', '30', '31', '32', '33', '34', '36', '38', '40', '42',
  'One Size', 'N/A'
];

const EbayInventory: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [customCountryMode, setCustomCountryMode] = useState(false);
  const [customSizeMode, setCustomSizeMode] = useState(false);

  const fetchInventory = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await axios.get(`${API_BASE}/ebay/inventory`);
      if (response.data && response.data.inventoryItems) {
        setItems(response.data.inventoryItems);
      }
    } catch (error: any) {
      console.error('Failed to fetch inventory');
      const msg = error.response?.data?.error || 'Failed to fetch inventory from eBay';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const toggleSelect = (sku: string) => {
    const newSelected = new Set(selectedSkus);
    if (newSelected.has(sku)) {
      newSelected.delete(sku);
    } else {
      newSelected.add(sku);
    }
    setSelectedSkus(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedSkus.size === filteredItems.length) {
      setSelectedSkus(new Set());
    } else {
      setSelectedSkus(new Set(filteredItems.map(i => i.sku)));
    }
  };

  const filteredItems = items.filter(item => {
    const title = item.product?.title || '';
    const sku = item.sku || '';
    const brand = item.product?.aspects?.Brand?.[0] || '';
    const country = item.product?.aspects?.['Country/Region of Manufacture']?.[0] || '';
    
    const searchLower = searchTerm.toLowerCase();
    return title.toLowerCase().includes(searchLower) ||
           sku.toLowerCase().includes(searchLower) ||
           brand.toLowerCase().includes(searchLower) ||
           country.toLowerCase().includes(searchLower);
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isBulkEdit, setIsBulkEdit] = useState(false);

  const handleEdit = (item: InventoryItem) => {
    const val = item.product?.aspects?.['Country/Region of Manufacture']?.[0] || '';
    setCustomCountryMode(val !== '' && !COMMON_COUNTRIES.includes(val));
    const sizeVal = item.product?.aspects?.Size?.[0] || '';
    setCustomSizeMode(sizeVal !== '' && !COMMON_SIZES.includes(sizeVal));
    setEditingItem(JSON.parse(JSON.stringify(item)));
    setIsBulkEdit(false);
    setIsEditModalOpen(true);
  };

  const handleBulkEdit = () => {
    setCustomCountryMode(false);
    setCustomSizeMode(false);
    setEditingItem({
      sku: 'BULK',
      product: { title: '', aspects: {} },
      condition: '',
      availability: { shipToLocationAvailability: { quantity: 1 } }
    });
    setIsBulkEdit(true);
    setIsEditModalOpen(true);
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    try {
      if (isBulkEdit) {
        // Build aspects payload with only non-empty values
        const updatedAspects: Record<string, string[]> = {};
        if (editingItem.product?.aspects?.Brand?.[0]) {
          updatedAspects.Brand = [editingItem.product.aspects.Brand[0]];
        }
        if (editingItem.product?.aspects?.Size?.[0]) {
          updatedAspects.Size = [editingItem.product.aspects.Size[0]];
        }
        if (editingItem.product?.aspects?.['Country/Region of Manufacture']?.[0]) {
          updatedAspects['Country/Region of Manufacture'] = [editingItem.product.aspects['Country/Region of Manufacture'][0]];
        }

        const promises = Array.from(selectedSkus).map(sku => 
          axios.put(`${API_BASE}/ebay/inventory/${sku}`, {
            product: {
              aspects: updatedAspects
            }
          })
        );
        await Promise.all(promises);
        alert(`Successfully updated ${selectedSkus.size} items!`);
      } else {
        await axios.put(`${API_BASE}/ebay/inventory/${editingItem.sku}`, editingItem);
        alert('Item updated successfully!');
      }
      setIsEditModalOpen(false);
      setSelectedSkus(new Set());
      fetchInventory();
    } catch (error) {
      alert('Failed to save changes.');
    }
  };

  const handleDelete = async (sku: string) => {
    if (!confirm(`Are you sure you want to delete SKU: ${sku} from eBay? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API_BASE}/ebay/inventory/${sku}`);
      alert('Item deleted successfully from eBay!');
      fetchInventory();
    } catch (error) {
      alert('Failed to delete item from eBay');
    }
  };

  const [expandedSku, setExpandedSku] = useState<string | null>(null);

  return (
    <div className="space-y-8 pb-20">
      {/* ... (Modal remains same) ... */}
      <AnimatePresence>
        {isEditModalOpen && editingItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-[#0f0f12] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                <h3 className="text-xl font-bold">
                  {isBulkEdit ? `Bulk Edit (${selectedSkus.size} items)` : `Edit SKU: ${editingItem.sku}`}
                </h3>
                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white">
                   &times;
                </button>
              </div>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                 {!isBulkEdit && (
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">Title</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50"
                      value={editingItem.product?.title || ''}
                      onChange={(e) => setEditingItem({...editingItem, product: {...editingItem.product, title: e.target.value}})}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">Brand</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50"
                      placeholder={isBulkEdit ? "New brand for all..." : ""}
                      value={editingItem.product?.aspects?.Brand?.[0] || ''}
                      onChange={(e) => setEditingItem({
                        ...editingItem, 
                        product: {
                          ...editingItem.product, 
                          aspects: {...(editingItem.product?.aspects || {}), Brand: [e.target.value]}
                        }
                      })}
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">Size</label>
                      <button 
                        type="button"
                        onClick={() => setCustomSizeMode(!customSizeMode)}
                        className="text-[10px] text-blue-400 hover:text-white font-semibold transition-colors cursor-pointer"
                      >
                        {customSizeMode ? "Choose from List" : "Type manually"}
                      </button>
                    </div>
                    {customSizeMode ? (
                      <input 
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                        placeholder={isBulkEdit ? "New size for all..." : "Type size manually..."}
                        value={editingItem.product?.aspects?.Size?.[0] || ''}
                        onChange={(e) => setEditingItem({
                          ...editingItem, 
                          product: {
                            ...editingItem.product, 
                            aspects: {
                              ...(editingItem.product?.aspects || {}), 
                              Size: [e.target.value]
                            }
                          }
                        })}
                      />
                    ) : (
                      <select
                        className="w-full bg-[#151a18] border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                        value={editingItem.product?.aspects?.Size?.[0] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'other') {
                            setCustomSizeMode(true);
                          } else {
                            setEditingItem({
                              ...editingItem, 
                              product: {
                                ...editingItem.product, 
                                aspects: {
                                  ...(editingItem.product?.aspects || {}), 
                                  Size: val ? [val] : []
                                }
                              }
                            });
                          }
                        }}
                      >
                        <option value="">-- Select Size --</option>
                        {COMMON_SIZES.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="other">Other (Type manually)...</option>
                      </select>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">Country of Origin</label>
                      <button 
                        type="button"
                        onClick={() => setCustomCountryMode(!customCountryMode)}
                        className="text-[10px] text-blue-400 hover:text-white font-semibold transition-colors cursor-pointer"
                      >
                        {customCountryMode ? "Choose from List" : "Type manually"}
                      </button>
                    </div>
                    {customCountryMode ? (
                      <input 
                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                        placeholder={isBulkEdit ? "New country for all..." : "Type country of origin manually..."}
                        value={editingItem.product?.aspects?.['Country/Region of Manufacture']?.[0] || ''}
                        onChange={(e) => setEditingItem({
                          ...editingItem, 
                          product: {
                            ...editingItem.product, 
                            aspects: {
                              ...(editingItem.product?.aspects || {}), 
                              'Country/Region of Manufacture': [e.target.value]
                            }
                          }
                        })}
                      />
                    ) : (
                      <select
                        className="w-full bg-[#151a18] border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                        value={editingItem.product?.aspects?.['Country/Region of Manufacture']?.[0] || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'other') {
                            setCustomCountryMode(true);
                          } else {
                            setEditingItem({
                              ...editingItem, 
                              product: {
                                ...editingItem.product, 
                                aspects: {
                                  ...(editingItem.product?.aspects || {}), 
                                  'Country/Region of Manufacture': val ? [val] : []
                                }
                              }
                            });
                          }
                        }}
                      >
                        <option value="">-- Select Country --</option>
                        {COMMON_COUNTRIES.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="other">Other (Type manually)...</option>
                      </select>
                    )}
                  </div>
                </div>
                {!isBulkEdit && (
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">Quantity</label>
                    <input 
                      type="number"
                      className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans"
                      value={editingItem.availability?.shipToLocationAvailability?.quantity ?? 1}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        availability: {
                          ...editingItem.availability,
                          shipToLocationAvailability: { quantity: parseInt(e.target.value) }
                        }
                      })}
                    />
                  </div>
                )}
              </div>
              <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end gap-4">
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-6 py-2 glass rounded-xl hover:bg-white/10"
                >
                  Cancel
                </button>
                <button 
                  onClick={saveEdit}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 px-8"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
          <Package className="text-blue-400" />
          eBay Live Inventory
        </h2>
        <div className="flex gap-4">
          <button 
            onClick={fetchInventory}
            className="px-4 py-2 glass rounded-xl hover:text-blue-400 transition-all flex items-center gap-2 text-sm font-semibold"
          >
            <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
            Refresh Store
          </button>
        </div>
      </div>

      <div className="glass-card">
        <div className="flex gap-4 p-6 border-b border-white/5">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Filter by title, brand, or SKU..."
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-blue-500/50 outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          {selectedSkus.size > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex gap-2"
            >
              <button 
                onClick={handleBulkEdit}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-600/20 transition-all"
              >
                Bulk Update Selected ({selectedSkus.size})
              </button>
            </motion.div>
          )}
        </div>

        <div className="overflow-x-auto px-6 pb-6 mt-4">
          <table className="w-full text-left border-separate border-spacing-y-2">
            <thead>
              <tr className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">
                <th className="pb-4 pl-4 w-12">
                  <button onClick={toggleSelectAll} className="text-slate-500 hover:text-blue-400">
                    {selectedSkus.size === filteredItems.length && filteredItems.length > 0 ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                </th>
                <th className="pb-4">Product Info & Aspects</th>
                <th className="pb-4">SKU / ID</th>
                <th className="pb-4 text-center">Qty</th>
                <th className="pb-4 text-center">Status</th>
                <th className="pb-4 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence>
                {filteredItems.map((item) => (
                  <React.Fragment key={item.sku}>
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}
                      className={`group hover:bg-white/[0.04] transition-all cursor-pointer ${selectedSkus.has(item.sku) ? 'bg-blue-500/5 ring-1 ring-blue-500/20' : 'bg-white/[0.01]'}`}
                    >
                      <td className="py-6 pl-4 rounded-l-xl">
                        <button onClick={(e) => { e.stopPropagation(); toggleSelect(item.sku); }} className="text-slate-500 hover:text-blue-400">
                          {selectedSkus.has(item.sku) ? <CheckSquare size={20} className="text-blue-400" /> : <Square size={20} />}
                        </button>
                      </td>
                      <td className="py-6 max-w-xl">
                        <div className="flex items-center gap-4">
                           <div className="w-20 h-20 bg-slate-900 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center border border-white/5">
                            {item.product?.imageUrls?.[0] ? (
                              <img src={item.product.imageUrls[0]} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                            ) : (
                              <Package size={24} className="text-slate-700" />
                            )}
                          </div>
                          <div className="min-w-0 pr-4">
                            <p className="font-bold text-slate-200 leading-tight mb-2 group-hover:text-blue-400 transition-colors uppercase italic tracking-tight">{item.product?.title || 'Untitled Item'}</p>
                            <div className="flex flex-wrap gap-2">
                              {item.product?.aspects?.Brand?.[0] && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase font-black">
                                  {item.product.aspects.Brand[0]}
                                </span>
                              )}
                              {item.product?.aspects?.Size?.[0] && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5 uppercase font-black">
                                  SIZE: {item.product.aspects.Size[0]}
                                </span>
                              )}
                              {item.product?.aspects?.Color?.[0] && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5 uppercase font-black">
                                  COLOR: {item.product.aspects.Color[0]}
                                </span>
                              )}
                              {item.product?.aspects?.['Country/Region of Manufacture']?.[0] && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/5 uppercase font-black">
                                  ORIGIN: {item.product.aspects['Country/Region of Manufacture'][0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-6">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-mono font-bold text-slate-500 bg-white/5 px-2 py-1 rounded border border-white/5 w-fit">{item.sku}</span>
                          {item.listingId && (
                            <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 w-fit">ID: {item.listingId}</span>
                          )}
                        </div>
                      </td>
                      <td className="py-6 text-center">
                        <div className={`w-8 h-8 rounded-lg mx-auto flex items-center justify-center text-sm font-bold border ${(item.availability?.shipToLocationAvailability?.quantity ?? 0) < 1 ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-slate-800 text-slate-200 border-white/5'}`}>
                          {item.availability?.shipToLocationAvailability?.quantity ?? 0}
                        </div>
                      </td>
                      <td className="py-6 text-center">
                        <div className="flex flex-col gap-1 items-center justify-center">
                          {item.status === 'scheduled' ? (
                            <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                              SCHEDULED
                            </span>
                          ) : item.status === 'draft' ? (
                            <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-800 text-slate-500 border border-white/5">
                              DRAFT
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-green-500/10 text-green-500 border border-green-500/20">
                              LIVE
                            </span>
                          )}
                          {item.isTraditional && (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                              Traditional
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-6 text-right pr-4 rounded-r-xl">
                        <div className="flex justify-end gap-2">
                          {item.isTraditional ? (
                            <button 
                              disabled
                              title="Traditional listings must be edited in eBay Seller Hub"
                              className="p-3 glass rounded-xl opacity-30 cursor-not-allowed text-slate-500"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Edit2 size={16} />
                            </button>
                          ) : (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                              className="p-3 glass rounded-xl hover:bg-blue-600 transition-all hover:text-white group/btn"
                            >
                              <Edit2 size={16} />
                            </button>
                          )}
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.sku); }}
                            className="p-3 glass rounded-xl hover:bg-red-600 transition-all hover:text-white group/btn"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                    {expandedSku === item.sku && (
                      <motion.tr
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-black/30"
                      >
                        <td colSpan={6} className="p-8 border-b border-white/5">
                          <div className="grid grid-cols-3 gap-12">
                             <div className="col-span-2 space-y-4">
                               <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Full Title & Details</h5>
                               <p className="text-slate-300 text-lg font-semibold leading-relaxed">{item.product?.title || 'Untitled Item'}</p>
                               <div className="grid grid-cols-3 gap-4 pt-4">
                                  {Object.entries(item.product?.aspects || {}).map(([key, val]) => (
                                    <div key={key} className="bg-white/5 p-3 rounded-lg border border-white/5">
                                      <p className="text-[8px] text-slate-500 uppercase font-black mb-1">{key}</p>
                                      <p className="text-xs text-slate-200 font-bold uppercase">{val?.[0] || 'N/A'}</p>
                                    </div>
                                  ))}
                                  {item.isTraditional && (
                                    <div className="col-span-3 bg-amber-500/5 border border-amber-500/10 p-4 rounded-xl text-xs text-amber-500/80 font-medium">
                                      This is a traditional eBay listing. Specific custom item attributes are not managed through this application's database.
                                    </div>
                                  )}
                               </div>
                             </div>
                             <div className="space-y-4">
                               <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">eBay Metadata</h5>
                               <div className="glass p-4 rounded-xl border border-white/5 space-y-3">
                                  <div className="flex justify-between text-xs font-sans">
                                     <span className="text-slate-500 font-bold uppercase">Condition</span>
                                     <span className="text-slate-200 font-black">{item.condition}</span>
                                  </div>
                                  <div className="flex justify-between text-xs font-sans">
                                     <span className="text-slate-500 font-bold uppercase">SKU</span>
                                     <span className="text-blue-400 font-black">{item.sku}</span>
                                  </div>
                                  <div className="pt-2 border-t border-white/5">
                                    <a 
                                      href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent((item.product?.aspects?.Brand?.[0] || '') + ' ' + (item.product?.title || ''))}&LH_Sold=1&LH_Complete=1`}
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className="w-full py-2 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg transition-all text-xs font-semibold flex items-center justify-center gap-1.5 border border-blue-500/20 font-sans cursor-pointer"
                                    >
                                      <ExternalLink size={12} />
                                      Search Sold Comps
                                    </a>
                                  </div>
                               </div>
                             </div>
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </React.Fragment>
                ))}
              </AnimatePresence>
            </tbody>
          </table>
          {!loading && errorMsg && (
            <div className="py-20 text-center text-slate-400">
              <Package size={48} className="mx-auto mb-4 opacity-20 text-red-500" />
              <p className="text-[#B9735D] font-bold mb-2">{errorMsg}</p>
              {errorMsg.toLowerCase().includes('authenticated') && (
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Please click the <strong className="text-slate-300">Connect eBay</strong> button in the sidebar to authorize the application for your active environment.
                </p>
              )}
            </div>
          )}
          {!loading && !errorMsg && filteredItems.length === 0 && (
            <div className="py-20 text-center text-slate-500">
              <Package size={48} className="mx-auto mb-4 opacity-20" />
              <p>No inventory items found on eBay.</p>
            </div>
          )}
          {loading && (
            <div className="py-20 text-center text-slate-300 flex flex-col items-center gap-4">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="animate-pulse">Fetching inventory from eBay...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EbayInventory;
