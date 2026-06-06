import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DollarSign, ShoppingBag, TrendingUp, Package, Info, RefreshCw } from 'lucide-react';

const API_BASE = '/api';

interface DashboardStats {
  totalSales: number;
  totalOrders: number;
  itemsSold: number;
  aov: number;
  activeListings: number;
}

interface DailySalesItem {
  date: string;
  sales: number;
  orders: number;
}

interface BreakdownItem {
  brand?: string;
  category?: string;
  sales: number;
  percentage: number;
}

interface OrderItem {
  orderId: string;
  buyerName: string;
  title: string;
  brand: string;
  price: number;
  shippingCost: number;
  totalPaid: number;
  status: 'Pending Shipment' | 'Shipped';
  date: string;
}

interface DashboardData {
  isMock: boolean;
  stats: DashboardStats;
  brandBreakdown: BreakdownItem[];
  categoryBreakdown: BreakdownItem[];
  dailySales: DailySalesItem[];
  recentOrders: OrderItem[];
}

const SalesDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<'30days' | '7days'>('30days');

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/ebay/sales-dashboard`);
      setData(res.data);
    } catch (error) {
      console.error('Failed to fetch sales dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[600px] text-slate-400 gap-4">
        <RefreshCw className="animate-spin text-blue-500" size={36} />
        <p className="font-serif text-lg italic animate-pulse">Gathering listing analytics & live sales feed...</p>
      </div>
    );
  }

  // Filter daily sales based on timeframe
  const filteredDailySales = timeframe === '7days' 
    ? data.dailySales.slice(-7) 
    : data.dailySales;

  // SVG Chart Calculation Helpers
  const maxSalesVal = Math.max(...filteredDailySales.map(d => d.sales), 10);
  const chartHeight = 160;
  const chartWidth = 720;
  const padding = 10;
  
  const getCoordinates = () => {
    const totalDays = filteredDailySales.length;
    return filteredDailySales.map((item, idx) => {
      const x = padding + (idx / (totalDays - 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - (item.sales / maxSalesVal) * (chartHeight - padding * 2);
      return { x, y, ...item };
    });
  };

  const coordinates = getCoordinates();
  
  // Construct path string for SVG
  const linePath = coordinates.reduce((path, point, idx) => {
    return path + (idx === 0 ? `M ${point.x} ${point.y}` : ` L ${point.x} ${point.y}`);
  }, '');

  const areaPath = coordinates.length > 0 
    ? `${linePath} L ${coordinates[coordinates.length - 1].x} ${chartHeight - padding} L ${coordinates[0].x} ${chartHeight - padding} Z`
    : '';

  return (
    <div className="space-y-8">
      {/* Top Banner (Shows if simulated data is active) */}
      {data.isMock && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3">
            <Info className="text-amber-500 flex-shrink-0" size={20} />
            <div className="text-xs">
              <span className="font-bold text-slate-200 block">Simulated Fallback Mode Active</span>
              <span className="text-slate-400 font-sans">Connect your eBay account in the sidebar to sync live transactions. Showing simulated dashboard analytics customized for your store's inventory.</span>
            </div>
          </div>
          <button 
            onClick={fetchDashboardData}
            className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      )}

      {/* Main KPI Row - Rebalanced to 4 columns */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Revenue */}
        <div className="glass-card p-5 relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
            <DollarSign size={90} className="text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Sales (30d)</p>
          <h3 className="text-2xl font-bold font-mono text-slate-100">${data.stats.totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
          <span className="text-[10px] text-green-400 font-bold flex items-center gap-0.5 mt-2">
            <TrendingUp size={10} /> +12.3% vs last month
          </span>
        </div>

        {/* Total Orders */}
        <div className="glass-card p-5 relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
            <ShoppingBag size={90} className="text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Orders Placed</p>
          <h3 className="text-2xl font-bold font-mono text-slate-100">{data.stats.totalOrders}</h3>
          <p className="text-[10px] text-slate-500 mt-2 font-sans">{data.stats.itemsSold} items total sold</p>
        </div>

        {/* Average Order Value */}
        <div className="glass-card p-5 relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
            <TrendingUp size={90} className="text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Avg Order Value</p>
          <h3 className="text-2xl font-bold font-mono text-slate-100">${data.stats.aov.toFixed(2)}</h3>
          <p className="text-[10px] text-slate-500 mt-2 font-sans">Ideal for clothing comps</p>
        </div>

        {/* Active Listings */}
        <div className="glass-card p-5 relative overflow-hidden group">
          <div className="absolute right-[-10px] bottom-[-10px] opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
            <Package size={90} className="text-blue-500" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Active Listings</p>
          <h3 className="text-2xl font-bold font-mono text-slate-100">{data.stats.activeListings}</h3>
          <span className="text-[10px] text-blue-400 font-bold flex items-center gap-0.5 mt-2">
            511 total synced
          </span>
        </div>
      </div>

      {/* Charts & Analytics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Sales Trend SVG Chart */}
        <div className="glass-card p-6 lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-white/5">
            <div>
              <h3 className="font-serif text-lg font-bold text-slate-100">Sales Velocity Trend</h3>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">Track daily order totals and volume metrics</p>
            </div>
            <div className="bg-slate-950/40 p-0.5 rounded-lg border border-white/5 flex">
              <button 
                onClick={() => setTimeframe('30days')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${timeframe === '30days' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                30 Days
              </button>
              <button 
                onClick={() => setTimeframe('7days')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${timeframe === '7days' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                7 Days
              </button>
            </div>
          </div>

          <div className="relative pt-4">
            {/* Custom SVG Line Chart */}
            <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto overflow-visible">
              <defs>
                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.00" />
                </linearGradient>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const y = padding + ratio * (chartHeight - padding * 2);
                return (
                  <line 
                    key={idx}
                    x1={padding}
                    y1={y}
                    x2={chartWidth - padding}
                    y2={y}
                    stroke="rgba(255,255,255,0.03)"
                    strokeWidth="1"
                  />
                );
              })}

              {/* Area under line */}
              {coordinates.length > 0 && (
                <path 
                  d={areaPath} 
                  fill="url(#chartGrad)" 
                />
              )}

              {/* Line path */}
              {coordinates.length > 0 && (
                <path 
                  d={linePath} 
                  fill="none" 
                  stroke="#3b82f6" 
                  strokeWidth="2.5" 
                  strokeLinecap="round"
                />
              )}

              {/* Data points */}
              {coordinates.length > 0 && coordinates.map((pt, idx) => (
                <circle 
                  key={idx}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.5"
                  fill="#1e293b"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  className="hover:scale-150 hover:fill-blue-400 transition-all duration-300 cursor-pointer"
                >
                  <title>{`Date: ${pt.date}, Sales: $${pt.sales}`}</title>
                </circle>
              ))}
            </svg>

            {/* X Axis Labels */}
            <div className="flex justify-between text-[8px] text-slate-500 uppercase tracking-widest pt-2 font-mono font-bold">
              <span>{filteredDailySales[0]?.date ? new Date(filteredDailySales[0].date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : ''}</span>
              <span>{filteredDailySales[Math.floor(filteredDailySales.length / 2)]?.date ? new Date(filteredDailySales[Math.floor(filteredDailySales.length / 2)].date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : ''}</span>
              <span>{filteredDailySales[filteredDailySales.length - 1]?.date ? new Date(filteredDailySales[filteredDailySales.length - 1].date).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}) : ''}</span>
            </div>
          </div>
        </div>

        {/* Brand & Category Analytics */}
        <div className="glass-card p-6 flex flex-col justify-between">
          <div className="pb-4 border-b border-white/5">
            <h3 className="font-serif text-lg font-bold text-slate-100">Performance Analytics</h3>
            <p className="text-[10px] text-slate-500 font-sans mt-0.5">Top performing brands in sales revenue</p>
          </div>

          <div className="space-y-4 py-4 flex-1">
            {data.brandBreakdown.slice(0, 5).map((item) => (
              <div key={item.brand} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-bold text-slate-300">{item.brand}</span>
                  <span className="font-mono text-slate-400 font-semibold">${item.sales.toFixed(2)} ({item.percentage}%)</span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/[0.02]">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" 
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-white/5">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Top Category: {data.categoryBreakdown[0]?.category || 'Jeans'} ({data.categoryBreakdown[0]?.percentage || 0}%)</span>
          </div>
        </div>
      </div>

      {/* Recent Sales Feed Row - Expanded to occupy full width */}
      <div className="grid grid-cols-1 gap-8">
        <div className="glass-card p-6">
          <div className="pb-4 border-b border-white/5 flex justify-between items-center">
            <div>
              <h3 className="font-serif text-lg font-bold text-slate-100">Recent Sales Feed</h3>
              <p className="text-[10px] text-slate-500 font-sans mt-0.5">Chronological sales transactions synced</p>
            </div>
          </div>

          <div className="overflow-x-auto pt-4">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-slate-450 text-[10px] uppercase tracking-widest font-bold">
                  <th className="pb-3">Buyer & Date</th>
                  <th className="pb-3">Listing Details</th>
                  <th className="pb-3">Total Paid</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.recentOrders.map((order) => {
                  const dateStr = new Date(order.date).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  });

                  return (
                    <tr key={order.orderId} className="text-xs hover:bg-white/[0.01] transition-colors">
                      <td className="py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-bold text-slate-200">{order.buyerName}</span>
                          <span className="text-[9px] text-slate-500 font-mono font-semibold">{dateStr}</span>
                        </div>
                      </td>
                      <td className="py-4 max-w-sm">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-slate-300 truncate">{order.title}</span>
                          <span className="text-[9px] text-slate-500 uppercase font-black">{order.brand}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="flex flex-col gap-0.5 font-mono">
                          <span className="font-bold text-slate-200">${order.totalPaid.toFixed(2)}</span>
                          <span className="text-[9px] text-slate-500 font-semibold">Cost: ${order.price} + ${order.shippingCost} ship</span>
                        </div>
                      </td>
                      <td className="py-4 text-right">
                        {order.status === 'Pending Shipment' ? (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Awaiting Ship
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-green-500/10 text-green-500 border border-green-500/20">
                            Shipped
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesDashboard;
