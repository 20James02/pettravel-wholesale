"use client";

import { BarChart3, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import type { AdminReportsOverview } from "@/lib/domain";
import { formatVnd } from "@/lib/money";

interface AdminReportsProps {
  isAdmin: boolean;
  reportsOverview: AdminReportsOverview | null;
  isReportsLoading: boolean;
  reportsError: string;
  fetchReportsOverview: () => Promise<void>;
}

export function AdminReports({
  isAdmin,
  reportsOverview,
  isReportsLoading,
  reportsError,
  fetchReportsOverview
}: AdminReportsProps) {
  if (!isAdmin) return null;

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
                Tổng hợp doanh thu, AR aging, kiểm tra cân đối số dư và báo cáo tồn kho tự động
              </span>
            </div>
          </div>

          <button
            type="button"
            className="bg-[#191e36] hover:bg-[#222846] text-gray-200 border border-[#2b3356] font-bold text-xs py-2 px-4 rounded-full flex items-center gap-2 cursor-pointer transition"
            onClick={fetchReportsOverview}
            disabled={isReportsLoading}
          >
            <RefreshCw size={14} className={isReportsLoading ? "animate-spin" : ""} />
            <span>{isReportsLoading ? "Đang tải..." : "Refresh Report"}</span>
          </button>
        </div>

        {reportsError && (
          <div className="p-4 border border-rose-500/30 bg-rose-500/10 text-rose-300 rounded-2xl flex items-start gap-3">
            <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-sm text-white block">Không tải được báo cáo</strong>
              <p className="text-xs text-rose-300 m-0 mt-1">{reportsError}</p>
            </div>
          </div>
        )}

        {reportsOverview && (
          <div className="flex flex-col gap-5">
            {/* Basis Banner */}
            <div className="p-3.5 bg-[#171b32] rounded-2xl border border-[#262e4e] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-indigo-400" />
                <span className="text-gray-300 font-semibold">
                  Cơ sở số liệu:{" "}
                  <strong className="text-white">
                    {reportsOverview.basis === "posted_only" ? "Sổ cái đã hạch toán" : "Ước tính vận hành & sổ cái"}
                  </strong>
                </span>
              </div>

              <div className="text-xs text-indigo-300 font-mono font-bold">
                Lệch Trial Balance: {formatVnd(reportsOverview.kpis.trialBalanceDifferenceVnd)}
              </div>
            </div>

            {/* 12-Cell Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
              <div className="bg-[#191e36] p-3.5 rounded-2xl border border-[#283152]">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Đơn hàng B2B</span>
                <div className="text-lg font-black text-white font-mono mt-1">
                  {reportsOverview.kpis.totalOrders}
                </div>
                <span className="text-[10px] text-gray-400">Đã chốt: {reportsOverview.kpis.acceptedOrders}</span>
              </div>

              <div className="bg-[#191e36] p-3.5 rounded-2xl border border-[#283152]">
                <span className="text-[10px] font-bold text-emerald-400 uppercase">Doanh thu ước tính</span>
                <div className="text-lg font-black text-emerald-400 font-mono mt-1">
                  {formatVnd(reportsOverview.kpis.estimatedSalesVnd)}
                </div>
                <span className="text-[10px] text-gray-400">Gross: {formatVnd(reportsOverview.kpis.estimatedGrossSalesVnd)}</span>
              </div>

              <div className="bg-[#191e36] p-3.5 rounded-2xl border border-[#283152]">
                <span className="text-[10px] font-bold text-indigo-400 uppercase">Đã xác nhận thanh toán</span>
                <div className="text-lg font-black text-indigo-300 font-mono mt-1">
                  {formatVnd(reportsOverview.kpis.paymentConfirmedVnd)}
                </div>
                <span className="text-[10px] text-gray-400">Chờ proof: {formatVnd(reportsOverview.kpis.paymentPendingProofVnd)}</span>
              </div>

              <div className="bg-[#191e36] p-3.5 rounded-2xl border border-[#283152]">
                <span className="text-[10px] font-bold text-rose-400 uppercase">Phải thu đại lý (AR)</span>
                <div className="text-lg font-black text-rose-300 font-mono mt-1">
                  {formatVnd(reportsOverview.kpis.receivableOpenVnd)}
                </div>
                <span className="text-[10px] text-rose-400 font-bold">Quá hạn: {formatVnd(reportsOverview.kpis.receivableOverdueVnd)}</span>
              </div>
            </div>

            {/* Breakdown Tables Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-2">
              <div className="bg-[#171b30] p-4 rounded-2xl border border-[#272e4e] overflow-x-auto">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                  Doanh thu theo trạng thái đơn
                </h4>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                      <th className="py-2">Trạng thái</th>
                      <th className="py-2">Số đơn</th>
                      <th className="py-2 text-right">Giá trị</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232a48]">
                    {reportsOverview.salesByStatus.map((row) => (
                      <tr key={row.key} className="hover:bg-[#1f2542] transition">
                        <td className="py-2 text-gray-300 font-semibold">{row.label}</td>
                        <td className="py-2 font-mono text-gray-400">{row.quantity || 0}</td>
                        <td className="py-2 text-right font-mono font-bold text-white">
                          {formatVnd(row.amountVnd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-[#171b30] p-4 rounded-2xl border border-[#272e4e] overflow-x-auto">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
                  Tồn kho theo phân loại SKU
                </h4>
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                      <th className="py-2">SKU / Mặt hàng</th>
                      <th className="py-2 text-right">Số lượng</th>
                      <th className="py-2 text-right">Giá trị tồn</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232a48]">
                    {reportsOverview.inventoryBySku.map((item) => (
                      <tr key={item.key} className="hover:bg-[#1f2542] transition">
                        <td className="py-2 font-mono font-bold text-indigo-300">{item.label}</td>
                        <td className="py-2 text-right font-mono text-emerald-400 font-bold">{item.quantity || 0}</td>
                        <td className="py-2 text-right font-mono text-sky-400 font-bold">{formatVnd(item.amountVnd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
