'use client';

import { useMemo, useState } from 'react';
import MainLayout from '@/components/layout/MainLayout';
import { StatCard } from '@/components/ui/Card';
import Card from '@/components/ui/Card';
import CopyButton from '@/components/ui/CopyButton';
import Badge from '@/components/ui/Badge';
import Table, { Column } from '@/components/ui/Table';
import {
  useDailySummary,
  useWeChatMessage,
  useSalesTrend,
  useRecentSales,
} from '@/hooks/useDashboard';
import {
  usePhoneDailySummary,
  usePhoneWeChatMessage,
  usePhoneSalesTrend,
  usePhoneRecentSales,
} from '@/hooks/usePhoneDashboard';
import { useLowStock } from '@/hooks/useInventory';
import { usePhoneLowStock } from '@/hooks/usePhoneInventory';
import { useProductType } from '@/lib/product-context';
import {
  formatMWK,
  formatDateISO,
  formatDate,
  formatTyreLabel,
  formatPhoneLabel,
} from '@/lib/utils';
import { Sale, PhoneSale, InventoryItem, PhoneInventoryItem } from '@/lib/types';
import {
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export default function DashboardPage() {
  const { isTyre } = useProductType();
  const today = formatDateISO(new Date());
  const [selectedDate, setSelectedDate] = useState(today);

  const selected = new Date(selectedDate + 'T00:00:00');
  const year = selected.getFullYear();
  const month = selected.getMonth() + 1;

  // Tyre hooks
  const tyreSummary = useDailySummary(selectedDate);
  const tyreWechat = useWeChatMessage(selectedDate);
  const tyreTrend = useSalesTrend(year, month);
  const tyreRecent = useRecentSales(10);
  const tyreLowStock = useLowStock();

  // Phone hooks
  const phoneSummary = usePhoneDailySummary(selectedDate);
  const phoneWechat = usePhoneWeChatMessage(selectedDate);
  const phoneTrend = usePhoneSalesTrend(year, month);
  const phoneRecent = usePhoneRecentSales(10);
  const phoneLowStock = usePhoneLowStock();

  // Select active data
  const summary = isTyre ? tyreSummary.data : phoneSummary.data;
  const summaryLoading = isTyre ? tyreSummary.isLoading : phoneSummary.isLoading;
  const wechat = isTyre ? tyreWechat.data : phoneWechat.data;
  const trend = isTyre ? tyreTrend.data : phoneTrend.data;

  const revenueBreakdown = useMemo(() => {
    if (!summary) return [];
    return [
      { name: 'Cash', value: summary.revenue_cash_mwk, color: '#3b82f6' },
      { name: 'Mukuru', value: summary.revenue_mukuru_mwk, color: '#10b981' },
      { name: 'Card', value: summary.revenue_card_mwk, color: '#f59e0b' },
    ].filter((r) => r.value > 0);
  }, [summary]);

  const totalRevenue = summary?.total_revenue_mwk ?? 0;

  const productLabel = isTyre ? 'Tyres' : 'Phones';

  // Tyre recent sales columns
  const tyreRecentColumns: Column<Sale>[] = [
    {
      key: 'sale_date',
      label: 'Date',
      render: (s) => formatDate(s.sale_date),
    },
    {
      key: 'tyre',
      label: 'Tyre',
      render: (s) =>
        formatTyreLabel(s.tyre_size, s.tyre_type, s.tyre_brand, s.tyre_id),
    },
    { key: 'quantity', label: 'Qty', className: 'text-center' },
    {
      key: 'total',
      label: 'Total',
      render: (s) => formatMWK(s.total),
    },
    {
      key: 'payment_method',
      label: 'Payment',
      render: (s) => (
        <Badge
          variant={
            s.payment_method === 'Cash'
              ? 'info'
              : s.payment_method === 'Mukuru'
                ? 'success'
                : 'warning'
          }
        >
          {s.payment_method}
        </Badge>
      ),
    },
  ];

  // Phone recent sales columns
  const phoneRecentColumns: Column<PhoneSale>[] = [
    {
      key: 'sale_date',
      label: 'Date',
      render: (s) => formatDate(s.sale_date),
    },
    {
      key: 'phone',
      label: 'Phone',
      render: (s) =>
        formatPhoneLabel(s.phone_brand, s.phone_model, s.phone_config, s.phone_id),
    },
    { key: 'quantity', label: 'Qty', className: 'text-center' },
    {
      key: 'total',
      label: 'Total',
      render: (s) => formatMWK(s.total),
    },
    {
      key: 'payment_method',
      label: 'Payment',
      render: (s) => (
        <Badge
          variant={
            s.payment_method === 'Cash'
              ? 'info'
              : s.payment_method === 'Mukuru'
                ? 'success'
                : 'warning'
          }
        >
          {s.payment_method}
        </Badge>
      ),
    },
  ];

  return (
    <MainLayout title="Dashboard">
      {/* Date Picker */}
      <div className="flex items-center gap-3 mb-4">
        <Calendar size={16} className="text-slate-400" />
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value || today)}
          max={today}
          className="px-3 py-1.5 border border-slate-300 rounded-md text-sm
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        {selectedDate !== today && (
          <button
            onClick={() => setSelectedDate(today)}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            Back to Today
          </button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title={selectedDate === today ? "Today's Sales" : `Sales on ${formatDate(selectedDate)}`}
          value={summaryLoading ? '...' : `${summary?.total_sold_today ?? 0} PCS`}
          icon={ShoppingCart}
        />
        <StatCard
          title="Month Total"
          value={summaryLoading ? '...' : `${summary?.total_sold_month ?? 0} PCS`}
          icon={TrendingUp}
        />
        <StatCard
          title="Monthly Revenue"
          value={summaryLoading ? '...' : formatMWK(totalRevenue)}
          icon={DollarSign}
        />
        <StatCard
          title="Remaining Stock"
          value={summaryLoading ? '...' : String(summary?.total_remaining ?? 0)}
          icon={Package}
        />
      </div>

      {/* WeChat Summary */}
      {wechat?.message && (
        <Card title="WeChat Daily Summary" className="mb-6">
          <div className="flex items-start gap-4">
            <p className="flex-1 text-sm text-slate-700 bg-slate-50 px-4 py-3 rounded-md font-mono">
              {wechat.message}
            </p>
            <CopyButton text={wechat.message} label="Copy" />
          </div>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Sales Trend */}
        <Card title="Daily Sales (Current Month)" className="lg:col-span-2">
          {trend && trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={trend}>
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [`${value} PCS`, 'Sold']}
                  labelFormatter={(label) => `Day ${label}`}
                />
                <Bar dataKey="quantity" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 py-12 text-center">
              No sales data for this month yet.
            </p>
          )}
        </Card>

        {/* Revenue Breakdown */}
        <Card title="Revenue Breakdown">
          {revenueBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={revenueBreakdown}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {revenueBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatMWK(Number(value))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-400 py-12 text-center">
              No revenue data yet.
            </p>
          )}
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Low Stock Alerts */}
        <Card
          title="Low Stock Alerts"
          headerRight={
            isTyre
              ? tyreLowStock.data && tyreLowStock.data.length > 0
                ? <Badge variant="danger">{tyreLowStock.data.length} items</Badge>
                : null
              : phoneLowStock.data && phoneLowStock.data.length > 0
                ? <Badge variant="danger">{phoneLowStock.data.length} items</Badge>
                : null
          }
        >
          {isTyre ? (
            tyreLowStock.data && tyreLowStock.data.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {tyreLowStock.data.map((item: InventoryItem) => (
                  <div
                    key={item.tyre_id}
                    className="flex items-center justify-between px-3 py-2 bg-red-50 rounded text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-red-500" />
                      <span className="text-slate-700">
                        {item.size} - {item.brand}
                      </span>
                    </div>
                    <span className="font-medium text-red-600">
                      {item.remaining_stock} left
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">
                All stock levels are healthy.
              </p>
            )
          ) : (
            phoneLowStock.data && phoneLowStock.data.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {phoneLowStock.data.map((item: PhoneInventoryItem) => (
                  <div
                    key={item.phone_id}
                    className="flex items-center justify-between px-3 py-2 bg-red-50 rounded text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-red-500" />
                      <span className="text-slate-700">
                        {item.brand} {item.model}
                      </span>
                    </div>
                    <span className="font-medium text-red-600">
                      {item.remaining_stock} left
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 py-4 text-center">
                All stock levels are healthy.
              </p>
            )
          )}
        </Card>

        {/* Recent Sales */}
        <div className="lg:col-span-2">
          <Card title={`Recent ${productLabel} Sales`}>
            {isTyre ? (
              <Table
                columns={tyreRecentColumns}
                data={tyreRecent.data ?? []}
                keyExtractor={(s) => s.id}
                emptyMessage="No recent sales."
              />
            ) : (
              <Table
                columns={phoneRecentColumns}
                data={phoneRecent.data ?? []}
                keyExtractor={(s) => s.id}
                emptyMessage="No recent sales."
              />
            )}
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
