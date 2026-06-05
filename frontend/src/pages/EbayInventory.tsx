import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Package, Search, Edit2, Trash2, CheckSquare, Square, RefreshCcw, ExternalLink, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
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
  startTime?: string;
  endTime?: string;
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

const COLUMN_LABELS: Record<string, string> = {
  sku: 'SKU / Listing ID',
  qty: 'Quantity',
  status: 'Status',
  country: 'Country of Origin',
  endTime: 'Expiration Date',
  brand: 'Brand',
  size: 'Size',
  material: 'Material',
  rise: 'Rise',
  pattern: 'Pattern',
  fit: 'Fit',
  closure: 'Closure',
  type: 'Type',
  department: 'Department',
  color: 'Color',
};

const EbayInventory: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [customCountryMode, setCustomCountryMode] = useState(false);
  const [customSizeMode, setCustomSizeMode] = useState(false);
  
  const [editingItemLoading, setEditingItemLoading] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkActionTab, setBulkActionTab] = useState<'manual' | 'ai'>('manual');
  const [bulkField, setBulkField] = useState('Country/Region of Manufacture');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkCustomCountry, setBulkCustomCountry] = useState(false);
  const [bulkCustomSize, setBulkCustomSize] = useState(false);
  const [bulkCustomRise, setBulkCustomRise] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosedItems, setDiagnosedItems] = useState<any[]>([]);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  const [showColumnDropdown, setShowColumnDropdown] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>({
    sku: true,
    qty: true,
    status: true,
    country: true,
    endTime: true,
    brand: false,
    size: false,
    material: false,
    rise: false,
    pattern: false,
    fit: false,
    closure: false,
    type: false,
    department: false,
    color: false,
  });
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
    const searchLower = searchTerm.toLowerCase();
    if (!searchLower) return true;

    const title = (item.product?.title || '').toLowerCase();
    const sku = (item.sku || '').toLowerCase();
    const listingId = (item.listingId || '').toLowerCase();
    const condition = (item.condition || '').toLowerCase();
    const status = (item.status || '').toLowerCase();
    
    let endTimeStr = 'gtc';
    if (item.endTime) {
      endTimeStr = new Date(item.endTime).toLocaleDateString().toLowerCase();
    } else if (item.isTraditional) {
      endTimeStr = 'n/a';
    }

    if (title.includes(searchLower) || 
        sku.includes(searchLower) || 
        listingId.includes(searchLower) || 
        condition.includes(searchLower) || 
        status.includes(searchLower) ||
        endTimeStr.includes(searchLower)) {
      return true;
    }

    if (item.product?.aspects) {
      for (const values of Object.values(item.product.aspects)) {
        if (values && values.some(v => String(v).toLowerCase().includes(searchLower))) {
          return true;
        }
      }
    }

    return false;
  });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (!sortField) return 0;

    let valA: string | number = '';
    let valB: string | number = '';

    if (sortField === 'sku') {
      valA = a.sku || '';
      valB = b.sku || '';
    } else if (sortField === 'qty') {
      valA = a.availability?.shipToLocationAvailability?.quantity ?? 0;
      valB = b.availability?.shipToLocationAvailability?.quantity ?? 0;
    } else if (sortField === 'status') {
      valA = a.status || '';
      valB = b.status || '';
    } else if (sortField === 'endTime') {
      valA = a.endTime || '';
      valB = b.endTime || '';
    } else {
      let aspectKey = sortField;
      if (sortField === 'country') {
        aspectKey = 'Country/Region of Manufacture';
      } else {
        aspectKey = sortField.charAt(0).toUpperCase() + sortField.slice(1);
      }
      valA = a.product?.aspects?.[aspectKey]?.[0] || '';
      valB = b.product?.aspects?.[aspectKey]?.[0] || '';
    }

    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    } else {
      return sortDirection === 'asc' 
        ? (valA as number) - (valB as number) 
        : (valB as number) - (valA as number);
    }
  });

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isBulkEdit, setIsBulkEdit] = useState(false);

  const handleEdit = async (item: InventoryItem) => {
    if (item.isTraditional && item.listingId) {
      setEditingItemLoading(true);
      try {
        const detailRes = await axios.post('/api/listings/import-comps', { itemId: item.listingId });
        const specifics = detailRes.data.specifics || {};
        
        const formattedAspects: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(specifics)) {
          formattedAspects[k] = [String(v)];
        }

        const enrichedItem: InventoryItem = {
          ...item,
          product: {
            ...item.product,
            description: detailRes.data.description,
            aspects: formattedAspects
          }
        };

        const val = enrichedItem.product?.aspects?.['Country/Region of Manufacture']?.[0] || '';
        setCustomCountryMode(val !== '' && !COMMON_COUNTRIES.includes(val));
        const sizeVal = enrichedItem.product?.aspects?.Size?.[0] || '';
        setCustomSizeMode(sizeVal !== '' && !COMMON_SIZES.includes(sizeVal));
        
        setEditingItem(enrichedItem);
        setIsBulkEdit(false);
        setIsEditModalOpen(true);
      } catch (err) {
        alert('Failed to load item details from eBay.');
      } finally {
        setEditingItemLoading(false);
      }
    } else {
      const val = item.product?.aspects?.['Country/Region of Manufacture']?.[0] || '';
      setCustomCountryMode(val !== '' && !COMMON_COUNTRIES.includes(val));
      const sizeVal = item.product?.aspects?.Size?.[0] || '';
      setCustomSizeMode(sizeVal !== '' && !COMMON_SIZES.includes(sizeVal));
      setEditingItem(JSON.parse(JSON.stringify(item)));
      setIsBulkEdit(false);
      setIsEditModalOpen(true);
    }
  };

  const handleBulkEdit = () => {
    setBulkField('Country/Region of Manufacture');
    setBulkValue('');
    setDiagnosedItems([]);
    setBulkActionTab('manual');
    setIsBulkModalOpen(true);
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    setLoading(true);
    try {
      if (editingItem.isTraditional && editingItem.listingId) {
        const specifics: Record<string, string> = {};
        if (editingItem.product?.aspects) {
          for (const [k, v] of Object.entries(editingItem.product.aspects)) {
            if (v?.[0]) specifics[k] = v[0];
          }
        }
        
        const payload = [{
          listingId: editingItem.listingId,
          title: editingItem.product.title,
          quantity: editingItem.availability?.shipToLocationAvailability?.quantity,
          specifics
        }];

        await axios.post(`${API_BASE}/listings/ebay/inventory/bulk-revise`, { items: payload });
        alert('Item updated successfully on eBay!');
      } else {
        await axios.put(`${API_BASE}/ebay/inventory/${editingItem.sku}`, editingItem);
        alert('Item updated successfully!');
      }
      setIsEditModalOpen(false);
      setSelectedSkus(new Set());
      fetchInventory();
    } catch (error) {
      alert('Failed to save changes.');
    } finally {
      setLoading(false);
    }
  };

  const runAiDiagnosis = async () => {
    setIsDiagnosing(true);
    setBulkProgress("Loading item details from eBay...");
    try {
      const selectedItemsList = items.filter(item => selectedSkus.has(item.sku));
      const diagnosed = [];
      
      let count = 0;
      for (const item of selectedItemsList) {
        count++;
        const titleSnippet = item.product.title.substring(0, 30) + (item.product.title.length > 30 ? "..." : "");
        setBulkProgress(`[${count}/${selectedItemsList.length}] Fetching description for "${titleSnippet}"`);
        
        let description = item.product.description || '';
        let originalSpecifics = item.product.aspects || {};
        
        if (!description && item.listingId) {
          try {
            const detailRes = await axios.post('/api/listings/import-comps', { itemId: item.listingId });
            description = detailRes.data.description || '';
            
            const formatted: Record<string, string[]> = {};
            if (detailRes.data.specifics) {
              for (const [k, v] of Object.entries(detailRes.data.specifics)) {
                formatted[k] = [String(v)];
              }
            }
            originalSpecifics = formatted;
          } catch (err) {
            console.error(`Failed to fetch details for ${item.listingId}`);
          }
        }

        setBulkProgress(`[${count}/${selectedItemsList.length}] Running AI Diagnosis on "${titleSnippet}"`);
        
        let cleanedSpecs: Record<string, string> = {};
        let errorMsg: string | null = null;
        try {
          const extractRes = await axios.post('/api/listings/ebay/inventory/bulk-repair-extract', { 
            items: [{
              listingId: item.listingId || item.sku,
              title: item.product.title,
              description: description
            }]
          });
          
          const match = extractRes.data.results?.[0];
          if (match?.status === 'success') {
            const extractedSpecs = match.specifics;
            if (extractedSpecs) {
              for (const [k, v] of Object.entries(extractedSpecs)) {
                cleanedSpecs[k] = v === null ? '' : String(v);
              }
            }
          } else {
            errorMsg = match?.error || 'AI extraction failed';
          }
        } catch (aiErr: any) {
          errorMsg = aiErr.response?.data?.error || aiErr.message || 'AI extraction failed';
          console.error(`AI Extraction failed for item ${item.sku}`, aiErr);
        }

        const countryVal = cleanedSpecs['Country/Region of Manufacture'] || '';
        diagnosed.push({
          sku: item.sku,
          listingId: item.listingId,
          title: item.product.title,
          description: description,
          originalSpecifics,
          specifics: cleanedSpecs,
          error: errorMsg,
          customCountry: countryVal !== '' && !COMMON_COUNTRIES.includes(countryVal)
        });
      }

      setDiagnosedItems(diagnosed);
      setBulkProgress(null);
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'AI Diagnosis failed');
      setBulkProgress(null);
    } finally {
      setIsDiagnosing(false);
    }
  };

  const saveManualBulk = async () => {
    setLoading(true);
    try {
      const selectedItemsList = items.filter(item => selectedSkus.has(item.sku));
      const payloadItems = selectedItemsList.map(item => {
        const isPrice = bulkField === 'StartPrice';
        const isQty = bulkField === 'Quantity';
        
        return {
          listingId: item.listingId || item.sku,
          price: isPrice ? bulkValue : undefined,
          quantity: isQty ? parseInt(bulkValue) : undefined,
          specifics: (!isPrice && !isQty) ? { [bulkField]: bulkValue } : undefined
        };
      });

      const res = await axios.post('/api/listings/ebay/inventory/bulk-revise', { items: payloadItems });
      const results = res.data.results || [];
      
      const errors = results.filter((r: any) => r.status === 'error');
      if (errors.length > 0) {
        alert(`Update finished with some errors:\n${errors.map((e: any) => `ID ${e.listingId}: ${e.error}`).join('\n')}`);
      } else {
        alert(`Successfully updated ${results.length} items on eBay!`);
      }
      
      setIsBulkModalOpen(false);
      setSelectedSkus(new Set());
      fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Bulk update failed');
    } finally {
      setLoading(false);
    }
  };

  const saveAiBulk = async () => {
    setLoading(true);
    try {
      const payloadItems = diagnosedItems.map(item => ({
        listingId: item.listingId,
        specifics: item.specifics
      }));

      const res = await axios.post('/api/listings/ebay/inventory/bulk-revise', { items: payloadItems });
      const results = res.data.results || [];
      
      const errors = results.filter((r: any) => r.status === 'error');
      if (errors.length > 0) {
        alert(`Update finished with some errors:\n${errors.map((e: any) => `ID ${e.listingId}: ${e.error}`).join('\n')}`);
      } else {
        alert(`Successfully repaired and updated ${results.length} items on eBay!`);
      }

      setIsBulkModalOpen(false);
      setSelectedSkus(new Set());
      setDiagnosedItems([]);
      fetchInventory();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Bulk repair sync failed');
    } finally {
      setLoading(false);
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
              className="relative w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-900 flex justify-between items-center bg-slate-900/15">
                <h3 className="text-xl font-bold">
                  {isBulkEdit ? `Bulk Edit (${selectedSkus.size} items)` : `Edit SKU: ${editingItem.sku}`}
                </h3>
                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-100">
                   &times;
                </button>
              </div>
              <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
                 {!isBulkEdit && (
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">Title</label>
                    <input 
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50"
                      value={editingItem.product?.title || ''}
                      onChange={(e) => setEditingItem({...editingItem, product: {...editingItem.product, title: e.target.value}})}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">Brand</label>
                    <input 
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50"
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
                        className="text-[10px] text-blue-400 hover:text-slate-100 font-semibold transition-colors cursor-pointer"
                      >
                        {customSizeMode ? "Choose from List" : "Type manually"}
                      </button>
                    </div>
                    {customSizeMode ? (
                      <input 
                        className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
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
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
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
                        className="text-[10px] text-blue-400 hover:text-slate-100 font-semibold transition-colors cursor-pointer"
                      >
                        {customCountryMode ? "Choose from List" : "Type manually"}
                      </button>
                    </div>
                    {customCountryMode ? (
                      <input 
                        className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
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
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
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

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 font-sans">Material</label>
                    <input 
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                      value={editingItem.product?.aspects?.Material?.[0] || ''}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        product: {
                          ...editingItem.product,
                          aspects: {
                            ...(editingItem.product?.aspects || {}),
                            Material: [e.target.value]
                          }
                        }
                      })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 font-sans">Rise</label>
                    <input 
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                      value={editingItem.product?.aspects?.Rise?.[0] || ''}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        product: {
                          ...editingItem.product,
                          aspects: {
                            ...(editingItem.product?.aspects || {}),
                            Rise: [e.target.value]
                          }
                        }
                      })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 font-sans">Pattern</label>
                    <input 
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                      value={editingItem.product?.aspects?.Pattern?.[0] || ''}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        product: {
                          ...editingItem.product,
                          aspects: {
                            ...(editingItem.product?.aspects || {}),
                            Pattern: [e.target.value]
                          }
                        }
                      })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 font-sans">Fit</label>
                    <input 
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                      value={editingItem.product?.aspects?.Fit?.[0] || ''}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        product: {
                          ...editingItem.product,
                          aspects: {
                            ...(editingItem.product?.aspects || {}),
                            Fit: [e.target.value]
                          }
                        }
                      })}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 font-sans">Closure</label>
                    <input 
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                      value={editingItem.product?.aspects?.Closure?.[0] || ''}
                      onChange={(e) => setEditingItem({
                        ...editingItem,
                        product: {
                          ...editingItem.product,
                          aspects: {
                            ...(editingItem.product?.aspects || {}),
                            Closure: [e.target.value]
                          }
                        }
                      })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2 font-sans">Quantity</label>
                  <input 
                    type="number"
                    className="w-full bg-slate-900/40 border border-slate-800 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
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
              </div>
              <div className="p-6 border-t border-slate-900 bg-slate-900/15 flex justify-end gap-4">
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

      {/* Bulk Actions Modal */}
      <AnimatePresence>
        {isBulkModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { if (!isDiagnosing) setIsBulkModalOpen(false); }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-slate-900 flex justify-between items-center bg-slate-900/15">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <span>Bulk Actions / Repair</span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/25">
                      {selectedSkus.size} items selected
                    </span>
                  </h3>
                </div>
                <button 
                  disabled={isDiagnosing}
                  onClick={() => setIsBulkModalOpen(false)} 
                  className="text-slate-400 hover:text-slate-100 disabled:opacity-20"
                >
                   &times;
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-900 bg-slate-900/10">
                <button
                  type="button"
                  disabled={isDiagnosing}
                  onClick={() => setBulkActionTab('manual')}
                  className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-all ${
                    bulkActionTab === 'manual' 
                      ? 'border-blue-500 text-slate-100 bg-slate-900/10' 
                      : 'border-transparent text-slate-400 hover:text-slate-100'
                  }`}
                >
                  Manual Bulk Edit
                </button>
                <button
                  type="button"
                  disabled={isDiagnosing}
                  onClick={() => setBulkActionTab('ai')}
                  className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider border-b-2 transition-all ${
                    bulkActionTab === 'ai' 
                      ? 'border-blue-500 text-slate-100 bg-slate-900/10' 
                      : 'border-transparent text-slate-400 hover:text-slate-100'
                  }`}
                >
                  AI Auto-Repair
                </button>
              </div>

              <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                {bulkProgress && (
                  <div className="bg-blue-500/5 border border-blue-500/10 p-6 rounded-xl text-center space-y-4">
                    <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-slate-300 font-medium animate-pulse">{bulkProgress}</p>
                  </div>
                )}

                {!bulkProgress && bulkActionTab === 'manual' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6 text-left">
                      <div>
                        <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block mb-2">Aspect / Field</label>
                        <select
                          className="w-full bg-[#151a18] border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                          value={bulkField}
                          onChange={(e) => {
                            setBulkField(e.target.value);
                            setBulkValue('');
                            setBulkCustomCountry(false);
                            setBulkCustomSize(false);
                            setBulkCustomRise(false);
                          }}
                        >
                          <option value="Country/Region of Manufacture">Country of Origin</option>
                          <option value="Brand">Brand</option>
                          <option value="Material">Material</option>
                          <option value="Size">Size</option>
                          <option value="Size Type">Size Type</option>
                          <option value="Department">Department</option>
                          <option value="Color">Color</option>
                          <option value="Rise">Rise</option>
                          <option value="Pattern">Pattern</option>
                          <option value="Fit">Fit</option>
                          <option value="Closure">Closure</option>
                          <option value="Fabric Type">Fabric Type</option>
                          <option value="Sleeve Length">Sleeve Length</option>
                          <option value="Quantity">Quantity</option>
                        </select>
                      </div>
                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">New Value</label>
                          {bulkField === 'Country/Region of Manufacture' && (
                            <button 
                              type="button"
                              onClick={() => setBulkCustomCountry(!bulkCustomCountry)}
                              className="text-[10px] text-blue-400 hover:text-white font-semibold transition-colors cursor-pointer"
                            >
                              {bulkCustomCountry ? "Choose from List" : "Type manually"}
                            </button>
                          )}
                          {bulkField === 'Size' && (
                            <button 
                              type="button"
                              onClick={() => setBulkCustomSize(!bulkCustomSize)}
                              className="text-[10px] text-blue-400 hover:text-white font-semibold transition-colors cursor-pointer"
                            >
                              {bulkCustomSize ? "Choose from List" : "Type manually"}
                            </button>
                          )}
                          {bulkField === 'Rise' && (
                            <button 
                              type="button"
                              onClick={() => setBulkCustomRise(!bulkCustomRise)}
                              className="text-[10px] text-blue-400 hover:text-white font-semibold transition-colors cursor-pointer"
                            >
                              {bulkCustomRise ? "Choose from List" : "Type manually"}
                            </button>
                          )}
                        </div>
                        
                        {bulkField === 'Country/Region of Manufacture' && !bulkCustomCountry ? (
                          <select
                            className="w-full bg-[#151a18] border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                            value={bulkValue}
                            onChange={(e) => setBulkValue(e.target.value)}
                          >
                            <option value="">-- Select Country --</option>
                            {COMMON_COUNTRIES.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : bulkField === 'Size' && !bulkCustomSize ? (
                          <select
                            className="w-full bg-[#151a18] border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                            value={bulkValue}
                            onChange={(e) => setBulkValue(e.target.value)}
                          >
                            <option value="">-- Select Size --</option>
                            {COMMON_SIZES.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : bulkField === 'Rise' && !bulkCustomRise ? (
                          <select
                            className="w-full bg-[#151a18] border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 font-sans text-slate-200"
                            value={bulkValue}
                            onChange={(e) => setBulkValue(e.target.value)}
                          >
                            <option value="">-- Select Rise --</option>
                            <option value="Mid (8.5-10.5 in)">Mid (8.5-10.5 in)</option>
                            <option value="Low (6.5-8.5 in)">Low (6.5-8.5 in)</option>
                            <option value="High (Greater than 10.5 in)">High (Greater than 10.5 in)</option>
                            <option value="Ultra Low (Less than 6.5 in)">Ultra Low (Less than 6.5 in)</option>
                          </select>
                        ) : (
                          <input
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-blue-500/50 text-slate-200 font-sans"
                            placeholder={
                              bulkField === 'Quantity' 
                                ? "Enter quantity (e.g. 1)..." 
                                : `Enter value for ${bulkField}...`
                            }
                            value={bulkValue}
                            onChange={(e) => setBulkValue(e.target.value)}
                          />
                        )}
                      </div>
                    </div>
                    <div className="p-4 bg-slate-900/40 border border-white/5 rounded-xl text-xs text-slate-400">
                      This will write the value <strong className="text-white">"{bulkValue || 'empty'}"</strong> to the field <strong className="text-white">"{bulkField}"</strong> for all <strong className="text-white">{selectedSkus.size}</strong> selected items directly on eBay.
                    </div>
                  </div>
                )}

                {!bulkProgress && bulkActionTab === 'ai' && diagnosedItems.length === 0 && (
                  <div className="text-center py-12 space-y-6">
                    <div className="max-w-md mx-auto space-y-2">
                      <h4 className="text-lg font-bold text-white">Extract Missing Aspects with AI</h4>
                      <p className="text-sm text-slate-400">
                        The AI will scan each listing's description to find details like brand, size, country of origin, rise, pattern, and closure, then populate them as structured eBay specifics.
                      </p>
                    </div>
                    <button
                      onClick={runAiDiagnosis}
                      className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg transition-all"
                    >
                      Run AI Diagnosis
                    </button>
                  </div>
                )}

                {!bulkProgress && bulkActionTab === 'ai' && diagnosedItems.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center">
                      <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Review Extracted Specifics</h4>
                      <button 
                        onClick={runAiDiagnosis} 
                        className="text-xs text-blue-400 hover:text-white font-bold flex items-center gap-1.5 bg-transparent border-none outline-none cursor-pointer"
                      >
                        <RefreshCcw size={12} />
                        Re-run Diagnosis
                      </button>
                    </div>
                    
                    <div className="space-y-4">
                      {diagnosedItems.map((item, idx) => (
                        <div key={item.sku} className="bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-4 text-left">
                          <div>
                            <p className="text-xs font-bold text-blue-400 mb-1">SKU: {item.sku} {item.listingId ? `(ID: ${item.listingId})` : ''}</p>
                            <p className="text-sm font-semibold text-slate-200 uppercase tracking-tight italic font-serif leading-tight">{item.title}</p>
                          </div>
                          
                          {item.error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-semibold leading-relaxed">
                              ⚠️ AI Diagnostic Error: {item.error}
                            </div>
                          )}
                          
                          <div className="grid grid-cols-4 gap-4">
                            {/* Brand */}
                            <div>
                              <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block mb-1">Brand</label>
                              <input 
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 font-sans"
                                value={item.specifics.Brand || ''}
                                onChange={(e) => {
                                  const updated = [...diagnosedItems];
                                  updated[idx].specifics.Brand = e.target.value;
                                  setDiagnosedItems(updated);
                                }}
                              />
                            </div>
                            {/* Size */}
                            <div>
                              <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block mb-1">Size</label>
                              <input 
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 font-sans"
                                value={item.specifics.Size || ''}
                                onChange={(e) => {
                                  const updated = [...diagnosedItems];
                                  updated[idx].specifics.Size = e.target.value;
                                  setDiagnosedItems(updated);
                                }}
                              />
                            </div>
                            {/* Country of Origin */}
                            <div>
                              <div className="flex justify-between items-center mb-1">
                                <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block">Origin</label>
                                <button 
                                  type="button"
                                  onClick={() => {
                                    const updated = [...diagnosedItems];
                                    updated[idx].customCountry = !updated[idx].customCountry;
                                    setDiagnosedItems(updated);
                                  }}
                                  className="text-[9px] text-blue-400 hover:text-white font-semibold transition-colors cursor-pointer"
                                >
                                  {item.customCountry ? "List" : "Type"}
                                </button>
                              </div>
                              {item.customCountry ? (
                                <input 
                                  className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 font-sans"
                                  value={item.specifics['Country/Region of Manufacture'] || ''}
                                  onChange={(e) => {
                                    const updated = [...diagnosedItems];
                                    updated[idx].specifics['Country/Region of Manufacture'] = e.target.value;
                                    setDiagnosedItems(updated);
                                  }}
                                />
                              ) : (
                                <select
                                  className="w-full bg-[#151a18] border border-white/10 rounded p-2 text-xs text-slate-200 font-sans"
                                  value={item.specifics['Country/Region of Manufacture'] || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = [...diagnosedItems];
                                    if (val === 'other') {
                                      updated[idx].customCountry = true;
                                    } else {
                                      updated[idx].specifics['Country/Region of Manufacture'] = val;
                                    }
                                    setDiagnosedItems(updated);
                                  }}
                                >
                                  <option value="">-- Select --</option>
                                  {COMMON_COUNTRIES.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                  <option value="other">Other (Type)...</option>
                                </select>
                              )}
                            </div>
                            {/* Rise */}
                            <div>
                              <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block mb-1">Rise</label>
                              <input 
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 font-sans"
                                value={item.specifics.Rise || ''}
                                onChange={(e) => {
                                  const updated = [...diagnosedItems];
                                  updated[idx].specifics.Rise = e.target.value;
                                  setDiagnosedItems(updated);
                                }}
                              />
                            </div>
                            {/* Pattern */}
                            <div>
                              <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block mb-1">Pattern</label>
                              <input 
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 font-sans"
                                value={item.specifics.Pattern || ''}
                                onChange={(e) => {
                                  const updated = [...diagnosedItems];
                                  updated[idx].specifics.Pattern = e.target.value;
                                  setDiagnosedItems(updated);
                                }}
                              />
                            </div>
                            {/* Fit */}
                            <div>
                              <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block mb-1">Fit</label>
                              <input 
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 font-sans"
                                value={item.specifics.Fit || ''}
                                onChange={(e) => {
                                  const updated = [...diagnosedItems];
                                  updated[idx].specifics.Fit = e.target.value;
                                  setDiagnosedItems(updated);
                                }}
                              />
                            </div>
                            {/* Material */}
                            <div className="col-span-2">
                              <label className="text-[9px] uppercase tracking-widest text-slate-500 font-bold block mb-1">Material</label>
                              <input 
                                className="w-full bg-white/5 border border-white/10 rounded p-2 text-xs text-slate-200 font-sans"
                                value={item.specifics.Material || ''}
                                onChange={(e) => {
                                  const updated = [...diagnosedItems];
                                  updated[idx].specifics.Material = e.target.value;
                                  setDiagnosedItems(updated);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 border-t border-white/5 bg-white/5 flex justify-end gap-4">
                <button 
                  disabled={isDiagnosing}
                  onClick={() => setIsBulkModalOpen(false)}
                  className="px-6 py-2 glass rounded-xl hover:bg-white/10 disabled:opacity-20"
                >
                  Cancel
                </button>
                {bulkActionTab === 'manual' ? (
                  <button 
                    disabled={!bulkValue || loading}
                    onClick={saveManualBulk}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-30 disabled:cursor-not-allowed px-8"
                  >
                    Apply changes to {selectedSkus.size} items
                  </button>
                ) : (
                  <button 
                    disabled={diagnosedItems.length === 0 || loading}
                    onClick={saveAiBulk}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg disabled:opacity-30 disabled:cursor-not-allowed px-8"
                  >
                    Sync specifics to eBay ({diagnosedItems.length} items)
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3 font-serif">
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
        <div className="flex gap-4 p-6 border-b border-slate-900">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Filter by title, aspects, condition, or SKU..."
              className="w-full pl-12 pr-4 py-3 bg-slate-900/40 border border-slate-800 rounded-xl focus:border-blue-500/50 outline-none transition-all font-sans text-slate-200"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Columns Selector Dropdown */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setShowColumnDropdown(!showColumnDropdown)}
              className="px-5 py-3 glass rounded-xl hover:text-blue-400 transition-all flex items-center gap-2 text-sm font-semibold h-full border border-slate-800"
            >
              <SlidersHorizontal size={18} />
              <span>Columns</span>
            </button>
            <AnimatePresence>
              {showColumnDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowColumnDropdown(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-4 z-50 space-y-2 max-h-80 overflow-y-auto text-left"
                  >
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-500 border-b border-slate-800 pb-2 mb-2">Configure Columns</h4>
                    {Object.entries(COLUMN_LABELS).map(([colId, label]) => (
                      <button
                        key={colId}
                        type="button"
                        onClick={() => {
                          setVisibleColumns({
                            ...visibleColumns,
                            [colId]: !visibleColumns[colId]
                          });
                        }}
                        className="flex items-center gap-3 w-full text-left p-1.5 rounded hover:bg-slate-900/10 transition-all text-xs font-medium text-slate-300"
                      >
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                          visibleColumns[colId] 
                            ? 'bg-blue-600 border-blue-600 text-white' 
                            : 'border-white/20'
                        }`}>
                          {visibleColumns[colId] && <span className="text-[10px] font-bold">✓</span>}
                        </div>
                        <span>{label}</span>
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
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
                Bulk Action / Repair ({selectedSkus.size})
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
                
                {/* Dynamic Columns Headers */}
                {Object.entries(visibleColumns).map(([colId, visible]) => {
                  if (!visible) return null;
                  const isCentered = ['qty', 'status', 'endTime'].includes(colId);
                  return (
                    <th key={colId} className={`pb-4 ${isCentered ? 'text-center' : ''}`}>
                      <button 
                        onClick={() => handleSort(colId)}
                        className={`flex items-center gap-1 hover:text-slate-300 font-bold uppercase tracking-widest text-[10px] transition-colors ${isCentered ? 'mx-auto' : ''}`}
                      >
                        <span>{COLUMN_LABELS[colId]}</span>
                        {sortField === colId ? (
                          sortDirection === 'asc' ? <ArrowUp size={12} className="text-blue-400" /> : <ArrowDown size={12} className="text-blue-400" />
                        ) : (
                          <ArrowUpDown size={12} className="opacity-30" />
                        )}
                      </button>
                    </th>
                  );
                })}

                <th className="pb-4 text-right pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              <AnimatePresence>
                {sortedItems.map((item) => (
                  <React.Fragment key={item.sku}>
                    <motion.tr 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      onClick={() => setExpandedSku(expandedSku === item.sku ? null : item.sku)}
                      className={`group hover:bg-slate-900/10 transition-all cursor-pointer ${selectedSkus.has(item.sku) ? 'bg-blue-500/5 ring-1 ring-blue-500/20' : 'bg-slate-950/20'}`}
                    >
                      <td className="py-6 pl-4 rounded-l-xl">
                        <button onClick={(e) => { e.stopPropagation(); toggleSelect(item.sku); }} className="text-slate-500 hover:text-blue-400">
                          {selectedSkus.has(item.sku) ? <CheckSquare size={20} className="text-blue-400" /> : <Square size={20} />}
                        </button>
                      </td>
                      <td className="py-6 max-w-xl">
                        <div className="flex items-center gap-4">
                           <div className="w-20 h-20 bg-slate-900 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-800">
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
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-900 uppercase font-black">
                                  SIZE: {item.product.aspects.Size[0]}
                                </span>
                              )}
                              {item.product?.aspects?.Color?.[0] && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-900 uppercase font-black">
                                  COLOR: {item.product.aspects.Color[0]}
                                </span>
                              )}
                              {item.product?.aspects?.['Country/Region of Manufacture']?.[0] && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-900 uppercase font-black">
                                  ORIGIN: {item.product.aspects['Country/Region of Manufacture'][0]}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      
                      {/* Dynamic Columns Cell Rendering */}
                      {Object.entries(visibleColumns).map(([colId, visible]) => {
                        if (!visible) return null;
                        
                        if (colId === 'sku') {
                          return (
                            <td key={colId} className="py-6">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-mono font-bold text-slate-500 bg-slate-900/40 px-2 py-1 rounded border border-slate-900 w-fit">{item.sku}</span>
                                {item.listingId && (
                                  <span className="text-[10px] font-mono font-bold text-blue-400 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 w-fit">ID: {item.listingId}</span>
                                )}
                              </div>
                            </td>
                          );
                        }
                        
                        if (colId === 'qty') {
                          return (
                            <td key={colId} className="py-6 text-center">
                              <div className={`w-8 h-8 rounded-lg mx-auto flex items-center justify-center text-sm font-bold border ${(item.availability?.shipToLocationAvailability?.quantity ?? 0) < 1 ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-slate-800 text-slate-200 border-slate-900'}`}>
                                {item.availability?.shipToLocationAvailability?.quantity ?? 0}
                              </div>
                            </td>
                          );
                        }
                        
                        if (colId === 'status') {
                          return (
                            <td key={colId} className="py-6 text-center">
                              <div className="flex flex-col gap-1 items-center justify-center">
                                {item.status === 'scheduled' ? (
                                  <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                                    SCHEDULED
                                  </span>
                                ) : item.status === 'draft' ? (
                                  <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-800 text-slate-500 border border-slate-900">
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
                          );
                        }
                        
                        if (colId === 'country') {
                          const val = item.product?.aspects?.['Country/Region of Manufacture']?.[0] || '-';
                          return (
                            <td key={colId} className="py-6 text-slate-300 text-xs font-semibold">
                              {val}
                            </td>
                          );
                        }
                        
                        if (colId === 'endTime') {
                          let display = 'GTC';
                          if (item.endTime) {
                            display = new Date(item.endTime).toLocaleDateString();
                          } else if (item.isTraditional) {
                            display = 'N/A';
                          }
                          return (
                            <td key={colId} className="py-6 text-center text-slate-300 text-xs font-semibold font-mono">
                              {display}
                            </td>
                          );
                        }
                        
                        // It is an aspect column
                        let aspectKey = colId;
                        if (colId === 'country') {
                          aspectKey = 'Country/Region of Manufacture';
                        } else {
                          aspectKey = colId.charAt(0).toUpperCase() + colId.slice(1);
                        }
                        const val = item.product?.aspects?.[aspectKey]?.[0] || '-';
                        return (
                          <td key={colId} className="py-6 text-slate-300 text-xs font-semibold">
                            {val}
                          </td>
                        );
                      })}

                      <td className="py-6 text-right pr-4 rounded-r-xl">
                        <div className="flex justify-end gap-2">
                           <button 
                             disabled={editingItemLoading}
                             onClick={(e) => { e.stopPropagation(); handleEdit(item); }}
                             className="p-3 glass rounded-xl hover:bg-blue-600 transition-all hover:text-white group/btn disabled:opacity-30 disabled:cursor-not-allowed"
                             title={editingItemLoading ? "Loading details..." : "Edit Listing specifics"}
                           >
                             <Edit2 size={16} className={editingItemLoading ? "animate-spin" : ""} />
                           </button>
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
                        <td colSpan={3 + Object.values(visibleColumns).filter(Boolean).length} className="p-8 border-b border-white/5">
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
              <p className="text-red-400 font-bold mb-2">{errorMsg}</p>
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
