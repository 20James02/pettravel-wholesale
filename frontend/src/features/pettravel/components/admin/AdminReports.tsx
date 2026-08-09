import { BarChart3, AlertTriangle, RefreshCw } from "lucide-react";
import type { AdminReportsOverview } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { StatusPill } from "../ui/StatusPill";

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
    <div className="flex flex-col gap-6 animate-fade-in w-full text-xs">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <BarChart3 size={22} className="text-orange-600" />
            <h2 className="text-xl font-bold text-[#331B08] font-['Varela_Round']">Báo cáo quản trị B2B</h2>
          </div>
          <p className="muted text-xs font-semibold">
            Tổng hợp doanh thu, thanh toán, tồn kho, hàng lỗi, bút toán và cảnh báo đối soát. Các số liệu kế toán chỉ được xem là
            chính thức khi lấy từ bút toán đã post và đối soát xong.
          </p>
        </div>
        <button
          type="button"
          className="tab-button text-xs py-2 px-4 border-orange-200 bg-white hover:bg-orange-50 cursor-pointer font-bold rounded-xl flex items-center gap-1.5"
          onClick={fetchReportsOverview}
          disabled={isReportsLoading}
        >
          <RefreshCw size={14} className={isReportsLoading ? "animate-spin" : ""} />
          {isReportsLoading ? "Đang tải..." : "Làm mới báo cáo"}
        </button>
      </div>

      {reportsError && (
        <div className="p-4 border border-red-200 bg-red-50 rounded-2xl flex items-start gap-3">
          <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div>
            <strong className="text-sm text-red-950 block">Không tải được báo cáo</strong>
            <p className="text-xs text-red-800 m-0 mt-1">{reportsError}</p>
          </div>
        </div>
      )}

      {reportsOverview && (
        <>
          <div className="panel p-4 border-orange-100 bg-orange-50/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <strong className="text-sm text-[#331B08]">
                  Cơ sở số liệu:{" "}
                  {reportsOverview.basis === "posted_only" ? "Bút toán đã hạch toán" : "Ước tính vận hành + sổ đã hạch toán"}
                </strong>
                <p className="text-[11px] muted m-0 mt-1 font-semibold">
                  Sinh lúc {new Date(reportsOverview.generatedAt).toLocaleString("vi-VN")}. Báo cáo này cố ý tách rõ số liệu chính thức
                  và số liệu ước tính để tránh khóa sổ sai lệch.
                </p>
              </div>
              <StatusPill tone={reportsOverview.kpis.trialBalanceDifferenceVnd === 0 ? "success" : "warning"}>
                Trial balance lệch: {formatVnd(reportsOverview.kpis.trialBalanceDifferenceVnd)}
              </StatusPill>
            </div>
          </div>

          <div className="metrics-grid">
            <div className="metric">
              <span className="muted text-sm font-semibold">Đơn B2B</span>
              <strong className="text-[#331B08]">{reportsOverview.kpis.totalOrders}</strong>
              <span className="text-[10px] muted">
                Đang xử lý: {reportsOverview.kpis.activeOrders} · Đã chốt: {reportsOverview.kpis.acceptedOrders}
              </span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Doanh thu ước tính</span>
              <strong className="text-green-700">{formatVnd(reportsOverview.kpis.estimatedSalesVnd)}</strong>
              <span className="text-[10px] muted">Gross: {formatVnd(reportsOverview.kpis.estimatedGrossSalesVnd)}</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Ưu đãi/chiết khấu</span>
              <strong className="text-amber-700">{formatVnd(reportsOverview.kpis.discountAndOfferVnd)}</strong>
              <span className="text-[10px] muted">Tính từ giá gross trừ báo giá cuối cùng.</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Thanh toán đã xác nhận</span>
              <strong className="text-blue-700">{formatVnd(reportsOverview.kpis.paymentConfirmedVnd)}</strong>
              <span className="text-[10px] muted">Chờ proof: {formatVnd(reportsOverview.kpis.paymentPendingProofVnd)}</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Phải thu đại lý</span>
              <strong className={reportsOverview.kpis.receivableOverdueVnd > 0 ? "text-red-700" : "text-blue-700"}>
                {formatVnd(reportsOverview.kpis.receivableOpenVnd)}
              </strong>
              <span className="text-[10px] muted font-semibold">Quá hạn: {formatVnd(reportsOverview.kpis.receivableOverdueVnd)}</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Phải trả đối tác</span>
              <strong className={reportsOverview.kpis.payableOverdueVnd > 0 ? "text-amber-700" : "text-[#331B08]"}>
                {formatVnd(reportsOverview.kpis.payableOpenVnd)}
              </strong>
              <span className="text-[10px] muted font-semibold">Quá hạn: {formatVnd(reportsOverview.kpis.payableOverdueVnd)}</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Đối soát đã khớp</span>
              <strong className="text-green-700">{formatVnd(reportsOverview.kpis.reconciliationMatchedVnd)}</strong>
              <span className="text-[10px] muted">Batch mở: {reportsOverview.kpis.openReconciliationBatches}</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Chưa khớp sao kê</span>
              <strong className={reportsOverview.kpis.reconciliationUnmatchedVnd > 0 ? "text-red-700" : "text-green-700"}>
                {formatVnd(reportsOverview.kpis.reconciliationUnmatchedVnd)}
              </strong>
              <span className="text-[10px] muted">GD chưa khớp: {reportsOverview.kpis.unmatchedBankTransactions}</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Giá trị tồn kho</span>
              <strong className="text-[#331B08]">{formatVnd(reportsOverview.kpis.inventoryValueVnd)}</strong>
              <span className="text-[10px] muted">
                Sẵn bán: {reportsOverview.kpis.availableQty} / Tồn thực: {reportsOverview.kpis.onHandQty}
              </span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Hàng đang giữ</span>
              <strong className="text-blue-700">{reportsOverview.kpis.reservationOpenQty}</strong>
              <span className="text-[10px] muted">Giữ quá hạn: {reportsOverview.kpis.reservationExpiredQty}</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Hàng lỗi</span>
              <strong className={reportsOverview.kpis.defectiveQty > 0 ? "text-red-700" : "text-green-700"}>
                {reportsOverview.kpis.defectiveQty}
              </strong>
              <span className="text-[10px] muted">Cần luồng trả NCC hoặc chốt giảm kho.</span>
            </div>
            <div className="metric">
              <span className="muted text-sm font-semibold">Bút toán đã hạch toán</span>
              <strong className="text-[#331B08]">{reportsOverview.kpis.postedJournalEntries}</strong>
              <span className="text-[10px] muted">Bút toán nháp: {reportsOverview.kpis.draftJournalEntries}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
            <div className="panel p-4 overflow-x-auto w-full">
              <h3 className="text-sm font-bold text-[#331B08] mb-3">Doanh thu theo trạng thái đơn</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Trạng thái</th>
                    <th>Số đơn</th>
                    <th className="text-right">Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsOverview.salesByStatus.length ? (
                    reportsOverview.salesByStatus.map((row) => (
                      <tr key={row.key}>
                        <td className="text-xs font-bold text-[#331B08]">{row.label}</td>
                        <td className="text-xs">{row.quantity ?? 0}</td>
                        <td className="text-xs text-right font-bold">{formatVnd(row.amountVnd)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-xs text-gray-500">
                        Chưa có dữ liệu đơn hàng.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel p-4 overflow-x-auto w-full">
              <h3 className="text-sm font-bold text-[#331B08] mb-3">Doanh thu gross theo nhà cung cấp</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Nhà cung cấp</th>
                    <th>Số lượng</th>
                    <th className="text-right">Giá trị</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsOverview.salesBySupplier.length ? (
                    reportsOverview.salesBySupplier.map((row) => (
                      <tr key={row.key}>
                        <td className="text-xs font-mono font-bold text-orange-950">{row.label}</td>
                        <td className="text-xs">{row.quantity ?? 0}</td>
                        <td className="text-xs text-right font-bold">{formatVnd(row.amountVnd)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-xs text-gray-500">
                        Chưa có dữ liệu bán theo nhà cung cấp.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel p-4 overflow-x-auto w-full">
              <h3 className="text-sm font-bold text-[#331B08] mb-3">Công nợ phải thu theo đại lý</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Đại lý</th>
                    <th>Số chứng từ</th>
                    <th className="text-right">Còn phải thu</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsOverview.receivableByCustomer.length ? (
                    reportsOverview.receivableByCustomer.map((row) => (
                      <tr key={row.key}>
                        <td className="text-xs font-bold text-[#331B08]">{row.label}</td>
                        <td className="text-xs">{row.quantity ?? 0}</td>
                        <td className="text-xs text-right font-bold text-blue-700">{formatVnd(row.amountVnd)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-xs text-gray-500">
                        Chưa có sổ công nợ phải thu.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel p-4 overflow-x-auto w-full">
              <h3 className="text-sm font-bold text-[#331B08] mb-3">Công nợ phải trả theo đối tác</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Đối tác/NCC</th>
                    <th>Số chứng từ</th>
                    <th className="text-right">Còn phải trả</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsOverview.payableByPartner.length ? (
                    reportsOverview.payableByPartner.map((row) => (
                      <tr key={row.key}>
                        <td className="text-xs font-bold text-[#331B08]">{row.label}</td>
                        <td className="text-xs">{row.quantity ?? 0}</td>
                        <td className="text-xs text-right font-bold text-amber-700">{formatVnd(row.amountVnd)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-xs text-gray-500">
                        Chưa có sổ công nợ phải trả.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel p-4 overflow-x-auto w-full">
              <h3 className="text-sm font-bold text-[#331B08] mb-3">Đối soát theo loại batch</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Loại</th>
                    <th>Batch</th>
                    <th className="text-right">Đã khớp</th>
                    <th className="text-right">Chênh lệch</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsOverview.reconciliationByType.length ? (
                    reportsOverview.reconciliationByType.map((row) => (
                      <tr key={row.key}>
                        <td className="text-xs font-bold text-[#331B08]">{row.label}</td>
                        <td className="text-xs">{row.quantity ?? 0}</td>
                        <td className="text-xs text-right font-bold text-green-700">{formatVnd(row.amountVnd)}</td>
                        <td className="text-xs text-right font-bold text-red-700">{formatVnd(row.secondaryAmountVnd ?? 0)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-gray-500">
                        Chưa có batch đối soát.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel p-4 overflow-x-auto w-full">
              <h3 className="text-sm font-bold text-[#331B08] mb-3">Giữ hàng theo SKU</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Đang giữ</th>
                    <th>Quá hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsOverview.reservationsBySku.length ? (
                    reportsOverview.reservationsBySku.map((row) => (
                      <tr key={row.key}>
                        <td className="text-xs font-mono font-bold text-orange-950">{row.label}</td>
                        <td className="text-xs font-bold text-blue-700">{row.quantity ?? 0}</td>
                        <td className="text-xs font-bold text-red-700">{row.secondaryAmountVnd ?? 0}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-xs text-gray-500">
                        Chưa có giữ hàng theo đơn.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel p-4 overflow-x-auto w-full">
              <h3 className="text-sm font-bold text-[#331B08] mb-3">Top tồn kho theo SKU</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Sẵn bán</th>
                    <th>Hàng lỗi</th>
                    <th className="text-right">Giá trị tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsOverview.inventoryBySku.length ? (
                    reportsOverview.inventoryBySku.map((row) => (
                      <tr key={row.key}>
                        <td className="text-xs font-mono font-bold text-orange-950">{row.label}</td>
                        <td className="text-xs">{row.quantity ?? 0}</td>
                        <td className="text-xs text-red-700 font-semibold">{row.secondaryAmountVnd ?? 0}</td>
                        <td className="text-xs text-right font-bold">{formatVnd(row.amountVnd)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-gray-500">
                        Chưa có dữ liệu tồn kho vận hành.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel p-4 overflow-x-auto w-full">
              <h3 className="text-sm font-bold text-[#331B08] mb-3">Trial balance mini theo tài khoản</h3>
              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Tài khoản</th>
                    <th className="text-right">Nợ</th>
                    <th className="text-right">Có</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsOverview.accountingByAccount.length ? (
                    reportsOverview.accountingByAccount.map((row) => (
                      <tr key={row.key}>
                        <td className="text-xs font-bold text-[#331B08]">{row.label}</td>
                        <td className="text-xs text-right font-bold">{formatVnd(row.amountVnd)}</td>
                        <td className="text-xs text-right font-bold">{formatVnd(row.secondaryAmountVnd ?? 0)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="py-6 text-center text-xs text-gray-500">
                        Chưa có bút toán kế toán.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel p-4 w-full">
            <h3 className="text-sm font-bold text-[#331B08] mb-3">Cảnh báo độ chính xác & đối soát</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {reportsOverview.alerts.length ? (
                reportsOverview.alerts.map((alert, index) => (
                  <div
                    key={`${alert.area}-${index}`}
                    className={`p-3 border rounded-2xl text-xs ${
                      alert.severity === "critical"
                        ? "border-red-200 bg-red-50 text-red-900"
                        : alert.severity === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-900"
                          : "border-blue-200 bg-blue-50 text-blue-900"
                    }`}
                  >
                    <strong className="block uppercase text-[10px] tracking-wide">
                      {alert.area} · {alert.severity}
                    </strong>
                    <span className="font-semibold">{alert.message}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 muted text-xs font-semibold col-span-2">Không có cảnh báo bất thường nào.</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
