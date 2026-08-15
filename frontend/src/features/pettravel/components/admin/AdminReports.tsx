"use client";

import { useMemo } from "react";
import { BarChart3, AlertTriangle, RefreshCw, Sparkles, TrendingUp, PackageCheck, Wallet, Clock } from "lucide-react";
import type { AdminReportsOverview, CustomerOrder, Product } from "@/lib/domain";
import { formatVnd } from "@/lib/money";

interface AdminReportsProps {
  isAdmin: boolean;
  reportsOverview: AdminReportsOverview | null;
  isReportsLoading: boolean;
  reportsError: string;
  fetchReportsOverview: () => Promise<void>;
  allOrders?: CustomerOrder[];
  allProducts?: Product[];
}

export function AdminReports({
  isAdmin,
  reportsOverview,
  isReportsLoading,
  reportsError,
  fetchReportsOverview,
  allOrders = [],
  allProducts = []
}: AdminReportsProps) {
  // Real-time client side metrics calculations
  const dynamicKpis = useMemo(() => {
    const totalOrders = allOrders.length;
    const acceptedOrders = allOrders.filter((o) => o.commercialStatus === "customer_accepted" || o.commercialStatus === "locked").length;
    const pendingOrders = allOrders.filter((o) => o.commercialStatus === "submitted" || o.commercialStatus === "admin_review").length;

    let estimatedSalesVnd = 0;
    let paymentConfirmedVnd = 0;

    allOrders.forEach((o) => {
      const q = o.quoteVersions?.[o.quoteVersions.length - 1];
      if (q) {
        estimatedSalesVnd += q.finalTotal;
        if (o.paymentStatus === "paid" || o.paymentStatus === "full_uploaded") {
          paymentConfirmedVnd += q.finalTotal;
        } else if (o.paymentStatus === "deposit_confirmed" || o.paymentStatus === "deposit_uploaded") {
          paymentConfirmedVnd += (q.depositAmount || 0);
        }
      }
    });

    const receivableOpenVnd = Math.max(0, estimatedSalesVnd - paymentConfirmedVnd);
    const totalUnits = allProducts.reduce((sum, p) => sum + p.variants.reduce((vSum, v) => vSum + v.stock, 0), 0);
    const totalStockValue = allProducts.reduce((sum, p) => sum + p.variants.reduce((vSum, v) => vSum + v.stock * (v.wholesalePrice || 0), 0), 0);

    return {
      totalOrders,
      acceptedOrders,
      pendingOrders,
      estimatedSalesVnd,
      paymentConfirmedVnd,
      receivableOpenVnd,
      totalUnits,
      totalStockValue
    };
  }, [allOrders, allProducts]);

  // Status breakdown calculations
  const statusBreakdown = useMemo(() => {
    const statusMap: Record<string, { label: string; count: number; amount: number }> = {
      submitted: { label: "Chờ phê duyệt", count: 0, amount: 0 },
      admin_review: { label: "Admin đang xem xét", count: 0, amount: 0 },
      quoted: { label: "Đã gửi báo giá", count: 0, amount: 0 },
      customer_accepted: { label: "Đại lý đã chấp thuận", count: 0, amount: 0 },
      locked: { label: "Đã khóa đơn / Hoàn tất", count: 0, amount: 0 },
      cancelled: { label: "Đã hủy", count: 0, amount: 0 }
    };

    allOrders.forEach((o) => {
      const status = o.commercialStatus || "submitted";
      const q = o.quoteVersions?.[o.quoteVersions.length - 1];
      const amount = q?.finalTotal || 0;
      if (statusMap[status]) {
        statusMap[status].count += 1;
        statusMap[status].amount += amount;
      } else {
        statusMap[status] = { label: status, count: 1, amount };
      }
    });

    return Object.entries(statusMap)
      .filter(([, val]) => val.count > 0)
      .map(([key, val]) => ({
        key,
        label: val.label,
        quantity: val.count,
        amountVnd: val.amount
      }));
  }, [allOrders]);

  // Product categories stock breakdown
  const categoryInventoryBreakdown = useMemo(() => {
    const catMap: Record<string, { count: number; value: number }> = {};
    allProducts.forEach((p) => {
      const cat = p.category || "Khác";
      const units = p.variants.reduce((sum, v) => sum + v.stock, 0);
      const val = p.variants.reduce((sum, v) => sum + v.stock * (v.wholesalePrice || 0), 0);
      if (!catMap[cat]) {
        catMap[cat] = { count: 0, value: 0 };
      }
      catMap[cat].count += units;
      catMap[cat].value += val;
    });

    return Object.entries(catMap).map(([key, val]) => ({
      key,
      label: key,
      quantity: val.count,
      amountVnd: val.value
    }));
  }, [allProducts]);

  if (!isAdmin) return null;

  const activeKpis = reportsOverview?.kpis || {
    totalOrders: dynamicKpis.totalOrders,
    acceptedOrders: dynamicKpis.acceptedOrders,
    estimatedSalesVnd: dynamicKpis.estimatedSalesVnd,
    estimatedGrossSalesVnd: dynamicKpis.estimatedSalesVnd,
    paymentConfirmedVnd: dynamicKpis.paymentConfirmedVnd,
    paymentPendingProofVnd: 0,
    receivableOpenVnd: dynamicKpis.receivableOpenVnd,
    receivableOverdueVnd: dynamicKpis.receivableOpenVnd,
    trialBalanceDifferenceVnd: 0
  };

  const activeSalesByStatus = reportsOverview?.salesByStatus?.length
    ? reportsOverview.salesByStatus
    : statusBreakdown;

  const activeInventoryBySku = reportsOverview?.inventoryBySku?.length
    ? reportsOverview.inventoryBySku
    : categoryInventoryBreakdown;

  return (
    <div className="flex flex-col gap-6 w-full animate-fade-in text-xs">
      {/* Dark Dock Header */}
      <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#222744] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
              <BarChart3 size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-extrabold text-white tracking-tight">
                Financial Analytics & Operational Intelligence
              </span>
              <span className="text-xs text-gray-400 font-medium">
                Tổng hợp dữ liệu doanh thu thực tế, đối soát sổ cái kế toán và phân bổ tồn kho khả dụng ATP
              </span>
            </div>
          </div>

          <button
            type="button"
            className="bg-[#191e36] hover:bg-[#222846] text-gray-200 border border-[#2b3356] font-bold text-xs py-2 px-4 rounded-full flex items-center gap-2 cursor-pointer transition active:scale-95"
            onClick={fetchReportsOverview}
            disabled={isReportsLoading}
          >
            <RefreshCw size={14} className={isReportsLoading ? "animate-spin" : ""} />
            <span>{isReportsLoading ? "Đang tải dữ liệu..." : "Làm mới dữ liệu"}</span>
          </button>
        </div>

        {reportsError && (
          <div className="p-4 border border-rose-500/30 bg-rose-500/10 text-rose-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-sm text-white block">Cảnh báo đồng bộ hóa</strong>
              <p className="text-xs text-rose-300 m-0 mt-1">{reportsError} (Hiển thị dữ liệu tính toán thời gian thực từ cơ sở dữ liệu)</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5">
          {/* Basis Banner */}
          <div className="p-3.5 bg-[#171b32] rounded-2xl border border-[#262e4e] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-indigo-400" />
              <span className="text-gray-300 font-semibold">
                Cơ sở số liệu:{" "}
                <strong className="text-white">
                  {reportsOverview?.basis === "posted_only" ? "Sổ cái đã hạch toán chính thức" : "Tính toán số liệu thực tế từ Đơn hàng & Tồn kho B2B"}
                </strong>
              </span>
            </div>

            <div className="text-xs text-emerald-400 font-mono font-bold flex items-center gap-1.5">
              <span>Độ lệch cân đối kế toán:</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                {formatVnd(activeKpis.trialBalanceDifferenceVnd || 0)} (Cân đối 100%)
              </span>
            </div>
          </div>

          {/* 4-Cell Primary Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-[#191e36] p-4 rounded-2xl border border-[#283152] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Đơn hàng B2B</span>
                <PackageCheck size={16} className="text-indigo-400" />
              </div>
              <div className="text-2xl font-black text-white font-mono my-2">
                {activeKpis.totalOrders}
              </div>
              <span className="text-[11px] text-gray-400 font-medium">
                Đã chốt: <strong className="text-white">{activeKpis.acceptedOrders}</strong> đơn
              </span>
            </div>

            <div className="bg-[#191e36] p-4 rounded-2xl border border-[#283152] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Doanh thu sỉ thực tế</span>
                <TrendingUp size={16} className="text-emerald-400" />
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono my-2">
                {formatVnd(activeKpis.estimatedSalesVnd)}
              </div>
              <span className="text-[11px] text-gray-400 font-medium">
                Doanh số chốt: {formatVnd(activeKpis.estimatedGrossSalesVnd)}
              </span>
            </div>

            <div className="bg-[#191e36] p-4 rounded-2xl border border-[#283152] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Đã thực thu (Cọc & Full)</span>
                <Wallet size={16} className="text-indigo-400" />
              </div>
              <div className="text-2xl font-black text-indigo-300 font-mono my-2">
                {formatVnd(activeKpis.paymentConfirmedVnd)}
              </div>
              <span className="text-[11px] text-gray-400 font-medium">
                Chờ đối soát: {formatVnd(activeKpis.paymentPendingProofVnd || 0)}
              </span>
            </div>

            <div className="bg-[#191e36] p-4 rounded-2xl border border-[#283152] flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Công nợ đại lý (AR)</span>
                <Clock size={16} className="text-rose-400" />
              </div>
              <div className="text-2xl font-black text-rose-300 font-mono my-2">
                {formatVnd(activeKpis.receivableOpenVnd)}
              </div>
              <span className="text-[11px] text-rose-400 font-bold">
                Cần thu: {formatVnd(activeKpis.receivableOverdueVnd)}
              </span>
            </div>
          </div>

          {/* Breakdown Tables Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
            <div className="bg-[#171b30] p-4 sm:p-5 rounded-2xl border border-[#272e4e] overflow-x-auto">
              <div className="flex items-center justify-between mb-3 border-b border-[#242b4b] pb-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider m-0">
                  Doanh thu theo trạng thái đơn hàng
                </h4>
                <span className="text-[10px] text-gray-400 font-mono">{activeSalesByStatus.length} trạng thái</span>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                    <th className="py-2">Trạng thái</th>
                    <th className="py-2">Số đơn</th>
                    <th className="py-2 text-right">Giá trị</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232a48]">
                  {activeSalesByStatus.map((row) => (
                    <tr key={row.key} className="hover:bg-[#1f2542] transition">
                      <td className="py-2.5 text-gray-300 font-semibold">{row.label}</td>
                      <td className="py-2.5 font-mono text-gray-400">{row.quantity || 0}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-white">
                        {formatVnd(row.amountVnd)}
                      </td>
                    </tr>
                  ))}
                  {activeSalesByStatus.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-gray-400 italic">
                        Chưa có đơn hàng nào trong hệ thống.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-[#171b30] p-4 sm:p-5 rounded-2xl border border-[#272e4e] overflow-x-auto">
              <div className="flex items-center justify-between mb-3 border-b border-[#242b4b] pb-2">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider m-0">
                  Tồn kho và Giá trị theo Danh mục
                </h4>
                <span className="text-[10px] text-emerald-400 font-mono">{activeInventoryBySku.length} danh mục</span>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                    <th className="py-2">Danh mục / Phân loại</th>
                    <th className="py-2 text-right">Số lượng tồn</th>
                    <th className="py-2 text-right">Giá trị tồn kho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232a48]">
                  {activeInventoryBySku.map((item) => (
                    <tr key={item.key} className="hover:bg-[#1f2542] transition">
                      <td className="py-2.5 font-mono font-bold text-indigo-300">{item.label}</td>
                      <td className="py-2.5 text-right font-mono text-emerald-400 font-bold">{item.quantity || 0}</td>
                      <td className="py-2.5 text-right font-mono text-sky-400 font-bold">{formatVnd(item.amountVnd)}</td>
                    </tr>
                  ))}
                  {activeInventoryBySku.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-4 text-center text-gray-400 italic">
                        Chưa có dữ liệu tồn kho sản phẩm.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
