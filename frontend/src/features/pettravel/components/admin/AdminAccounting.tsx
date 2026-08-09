import { useState, useMemo } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import type { CustomerOrder, AccountingOverview, JournalEntryDetail } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { StatusPill } from "../ui/StatusPill";
import { promotionsPolicySchema } from "@/lib/validation";

interface PromotionsPolicy {
  freeShippingThreshold: number;
  defaultDepositRate: number;
  maxOperatorDiscountRate: number;
  requireManagerApprovalAbove: number;
  giftThreshold?: number;
  giftName?: string;
}

interface AdminAccountingProps {
  activeTab: string;
  isAdmin: boolean;
  workingOrder: CustomerOrder;
  accountingOverview: AccountingOverview | null;
  accountingJournalEntries: JournalEntryDetail[];
  isAccountingLoading: boolean;
  isAccountingJournalLoading: boolean;
  accountingError: string;
  promotionsPolicy: PromotionsPolicy;
  setPromotionsPolicy: (policy: PromotionsPolicy) => void;
  fetchAccountingOverview: () => Promise<void>;
  fetchAccountingJournalEntries: () => Promise<void>;
  fetchPromotions: () => Promise<void>;
  rolePermissions: Record<string, string[]>;
  adminPolicy: {
    freeShippingThreshold: number;
    defaultDepositRate: number;
    maxOperatorDiscountRate: number;
    requireManagerApprovalAbove: number;
  };
}

export function AdminAccounting({
  activeTab,
  isAdmin,
  workingOrder,
  accountingOverview,
  accountingJournalEntries,
  isAccountingLoading,
  isAccountingJournalLoading,
  accountingError,
  promotionsPolicy,
  setPromotionsPolicy,
  fetchAccountingOverview,
  fetchAccountingJournalEntries,
  fetchPromotions,
  rolePermissions,
  adminPolicy
}: AdminAccountingProps) {
  // Local state for promotions config modal
  const [showPromotionsForm, setShowPromotionsForm] = useState(false);

  // Lấy bản báo giá cuối cùng của đơn hàng
  const quote = useMemo(() => {
    if (!workingOrder.quoteVersions || workingOrder.quoteVersions.length === 0) {
      return { finalTotal: 0, depositAmount: 0 };
    }
    return workingOrder.quoteVersions[workingOrder.quoteVersions.length - 1];
  }, [workingOrder.quoteVersions]);

  // Formatter tỷ lệ phần trăm
  const percent = (val: number) => {
    return `${Math.round(val * 100)}%`;
  };

  const handleSavePromotions = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/admin/promotions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(promotionsPolicySchema.parse(promotionsPolicy))
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Không thể lưu cấu hình.");
        return;
      }
      alert("Lưu cấu hình ưu đãi thành công!");
      await fetchPromotions();
      setShowPromotionsForm(false);
    } catch {
      alert("Lỗi kết nối.");
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-6 animate-fade-in w-full text-xs">
      {/* 1. TAB KẾ TOÁN DOANH NGHIỆP */}
      {activeTab === "admin_accounting" && (
        <div className="flex flex-col gap-6 w-full animate-fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <BookOpenCheck size={22} className="text-orange-600" />
                <h2 className="text-xl font-bold text-[#331B08] font-['Varela_Round']">Kế toán doanh nghiệp</h2>
              </div>
              <p className="muted text-xs font-semibold">
                Theo dõi kỳ kế toán, bút toán nháp/đã ghi sổ và chuẩn bị luồng tự động ghi nhận cọc, COD, doanh thu, VAT.
              </p>
            </div>
            <button
              type="button"
              className="tab-button text-xs py-2 px-4 border-orange-200 bg-white hover:bg-orange-50 cursor-pointer font-bold rounded-xl flex items-center gap-1.5"
              onClick={() => {
                fetchAccountingOverview();
                fetchAccountingJournalEntries();
              }}
              disabled={isAccountingLoading || isAccountingJournalLoading}
            >
              <RefreshCw size={14} className={isAccountingLoading || isAccountingJournalLoading ? "animate-spin" : ""} />
              {isAccountingLoading || isAccountingJournalLoading ? "Đang tải..." : "Làm mới số liệu"}
            </button>
          </div>

          {accountingError && (
            <div className="p-4 border border-red-200 bg-red-50 rounded-2xl flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm text-red-950 block">Không tải được dữ liệu kế toán</strong>
                <p className="text-xs text-red-800 m-0 mt-1">{accountingError}</p>
              </div>
            </div>
          )}

          <div className="metrics-grid">
            <div className="metric">
              <span className="muted text-sm flex items-center gap-1 font-semibold">
                <BookOpenCheck size={14} className="text-orange-600" /> Kỳ kế toán
              </span>
              <strong>{accountingOverview ? accountingOverview.periodsTotal : "—"}</strong>
              <span className="text-[10px] muted">
                Mở: {accountingOverview?.openPeriods ?? 0} · Đóng: {accountingOverview?.closedPeriods ?? 0}
              </span>
            </div>
            <div className="metric">
              <span className="muted text-sm flex items-center gap-1 font-semibold">
                <Clock size={14} className="text-amber-600" /> Bút toán nháp
              </span>
              <strong className="text-amber-700">{accountingOverview ? accountingOverview.draftEntries : "—"}</strong>
              <span className="text-[10px] muted">Chưa hạch toán, có thể kiểm tra/sửa đổi trước khi ghi sổ.</span>
            </div>
            <div className="metric">
              <span className="muted text-sm flex items-center gap-1 font-semibold">
                <CheckCircle2 size={14} className="text-green-600" /> Đã ghi sổ
              </span>
              <strong className="text-green-700">{accountingOverview ? accountingOverview.postedEntries : "—"}</strong>
              <span className="text-[10px] muted">Bút toán đã post sẽ bị khóa cứng để đảm bảo tính minh bạch.</span>
            </div>
            <div className="metric">
              <span className="muted text-sm flex items-center gap-1 font-semibold">
                <AlertTriangle size={14} className="text-red-600" /> Bút toán hủy
              </span>
              <strong className="text-red-700">{accountingOverview ? accountingOverview.voidEntries : "—"}</strong>
              <span className="text-[10px] muted">Theo dõi sai lệch và điều chỉnh dòng tiền doanh nghiệp.</span>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.6fr] gap-6">
            <div className="panel p-4 flex flex-col gap-4 overflow-x-auto w-full">
              <div className="flex items-center justify-between border-b border-dashed border-orange-100 pb-2">
                <h3 className="text-sm font-bold text-[#331B08]">Bút toán gần nhất</h3>
                <StatusPill tone={accountingOverview?.recentEntries.length ? "info" : "warning"}>
                  {accountingOverview?.recentEntries.length ? `${accountingOverview.recentEntries.length} dòng` : "Chưa có dữ liệu"}
                </StatusPill>
              </div>

              <table className="variant-table w-full">
                <thead>
                  <tr>
                    <th>Số bút toán</th>
                    <th>Nguồn</th>
                    <th>Diễn giải</th>
                    <th>Ngày tạo</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {accountingOverview?.recentEntries && accountingOverview.recentEntries.length > 0 ? (
                    accountingOverview.recentEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td className="text-xs font-mono font-bold text-orange-950">{entry.entryNo}</td>
                        <td>
                          <span className="text-xs font-bold block text-[#331B08]">{entry.sourceType}</span>
                          <span className="text-[10px] muted font-mono">{entry.sourceId}</span>
                        </td>
                        <td className="text-xs text-[#331B08] font-semibold">{entry.description}</td>
                        <td className="text-xs text-gray-500 font-mono">
                          {new Date(entry.createdAt).toLocaleString("vi-VN")}
                        </td>
                        <td>
                          <span
                            className={`status-pill text-[10px] ${
                              entry.status === "posted" ? "success" : entry.status === "draft" ? "warning" : "info"
                            }`}
                          >
                            {entry.status === "posted" ? "Đã ghi sổ" : entry.status === "draft" ? "Nháp" : "Đã hủy"}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs text-gray-500 font-medium">
                        Chưa có hạch toán nào.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="flex flex-col gap-3 border-t border-dashed border-orange-100 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#331B08] m-0">Sổ nhật ký chi tiết Nợ/Có</h3>
                    <p className="text-[10px] muted m-0 mt-0.5 font-semibold">
                      Hiển thị từng dòng hạch toán chi tiết để kiểm tra tài khoản, đối tượng và trạng thái cân Nợ/Có.
                    </p>
                  </div>
                  <StatusPill tone={accountingJournalEntries.length ? "info" : "warning"}>
                    {accountingJournalEntries.length ? `${accountingJournalEntries.length} hạch hạch` : "Chưa có dòng"}
                  </StatusPill>
                </div>

                {accountingJournalEntries.length ? (
                  <div className="flex flex-col gap-3">
                    {accountingJournalEntries.map((entry) => (
                      <div key={entry.id} className="rounded-2xl border border-orange-100 bg-[#FFFDF9] overflow-hidden">
                        <div className="p-3 bg-orange-50/50 border-b border-orange-100 flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <strong className="text-xs font-mono text-orange-950">{entry.entryNo}</strong>
                              <span
                                className={`status-pill text-[9px] ${
                                  entry.status === "posted" ? "success" : entry.status === "draft" ? "warning" : "info"
                                }`}
                              >
                                {entry.status === "posted" ? "Đã ghi sổ" : entry.status === "draft" ? "Nháp" : "Đã hủy"}
                              </span>
                              <span className={`status-pill text-[9px] ${entry.isBalanced ? "success" : "warning"}`}>
                                {entry.isBalanced ? "Cân Nợ/Có" : "Lệch Nợ/Có"}
                              </span>
                            </div>
                            <p className="text-[11px] text-[#331B08] font-semibold m-0 mt-1">{entry.description}</p>
                            <p className="text-[10px] muted m-0 mt-0.5 font-semibold">
                              Nguồn: <span className="font-mono">{entry.sourceType}</span> ·{" "}
                              <span className="font-mono">{entry.sourceId}</span>
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-right min-w-[220px]">
                            <div className="rounded-xl bg-white border border-orange-100 p-2">
                              <span className="text-[9px] muted uppercase font-bold block">Tổng Nợ</span>
                              <strong className="text-xs text-green-700">{formatVnd(entry.debitTotalVnd)}</strong>
                            </div>
                            <div className="rounded-xl bg-white border border-orange-100 p-2">
                              <span className="text-[9px] muted uppercase font-bold block">Tổng Có</span>
                              <strong className="text-xs text-blue-700">{formatVnd(entry.creditTotalVnd)}</strong>
                            </div>
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="variant-table w-full">
                            <thead>
                              <tr>
                                <th>Dòng</th>
                                <th>Tài khoản</th>
                                <th>Đối tượng / đơn</th>
                                <th className="text-right">Nợ</th>
                                <th className="text-right">Có</th>
                                <th>Ghi chú</th>
                              </tr>
                            </thead>
                            <tbody>
                              {entry.lines.map((line) => (
                                <tr key={line.id}>
                                  <td className="text-xs font-mono">{line.lineNo}</td>
                                  <td>
                                    <span className="text-xs font-bold text-[#331B08] block">
                                      {line.accountCode} - {line.accountName}
                                    </span>
                                  </td>
                                  <td className="text-[10px] text-gray-600 font-mono">
                                    {line.orderId ? <span className="block">Đơn: {line.orderId}</span> : null}
                                    {line.partnerOrgId ? <span className="block">Đối tác: {line.partnerOrgId}</span> : null}
                                    {line.supplierId ? <span className="block">NCC: {line.supplierId}</span> : null}
                                    {!line.orderId && !line.partnerOrgId && !line.supplierId ? "—" : null}
                                  </td>
                                  <td className="text-right text-xs font-bold text-green-700">
                                    {line.debitAmountVnd > 0 ? formatVnd(line.debitAmountVnd) : "—"}
                                  </td>
                                  <td className="text-right text-xs font-bold text-blue-700">
                                    {line.creditAmountVnd > 0 ? formatVnd(line.creditAmountVnd) : "—"}
                                  </td>
                                  <td className="text-[10px] text-gray-600">{line.memo || "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-2xl border border-dashed border-orange-200 bg-orange-50/30 text-xs text-orange-950 font-semibold">
                    Chưa có dòng nhật ký chi tiết nào. Bấm “Ghi sổ toàn bộ đơn” để đồng bộ hạch toán.
                  </div>
                )}
              </div>
            </div>

            <aside className="panel p-4 flex flex-col gap-4">
              <div className="section-title">
                <h3 className="text-lg font-bold">Kiểm soát kế toán</h3>
              </div>
              <div className="flex flex-col gap-3 text-[#331B08]">
                <div className="p-3 border border-green-200 bg-green-50/40 rounded-2xl">
                  <strong className="block text-green-800">Hạch toán Server-authoritative</strong>
                  <p className="m-0 mt-1 text-green-900 leading-relaxed font-semibold">
                    Mọi số liệu Nợ/Có đều được tính toán lại tại Server để chống gian lận.
                  </p>
                </div>
                <div className="p-3 border border-orange-200 bg-orange-50/40 rounded-2xl">
                  <strong className="block text-orange-900">Bảo mật chứng từ</strong>
                  <p className="m-0 mt-1 text-orange-950 leading-relaxed font-semibold">
                    Bút toán đã post không thể chỉnh sửa, chỉ có thể hạch toán đảo để giữ tính toàn vẹn.
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      )}

      {/* 2. TAB QUẢN LÝ HÓA ĐƠN VAT */}
      {activeTab === "admin_invoices" && (
        <div className="flex flex-col gap-6 w-full animate-fade-in">
          <div>
            <h2 className="text-xl font-bold text-[#331B08] font-['Varela_Round']">🧾 Quản lý Hóa đơn đỏ (VAT)</h2>
            <p className="muted text-xs font-semibold">
              Xuất hóa đơn giá trị gia tăng chính thức cho các đại lý yêu cầu chứng từ sỉ.
            </p>
          </div>

          <div className="panel p-4 flex flex-col gap-4 w-full">
            <div className="flex justify-between items-center border-b border-dashed border-orange-100 pb-2">
              <h3 className="text-sm font-bold text-[#331B08]">📋 Danh sách yêu cầu hóa đơn đỏ</h3>
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 font-bold">
                {workingOrder.invoiceRequested ? "1 Yêu cầu mới" : "Không có yêu cầu"}
              </span>
            </div>

            {workingOrder.invoiceRequested ? (
              <div className="border border-orange-100 rounded-2xl p-4 bg-[#FFFDF9] flex flex-col gap-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] muted font-bold">Tên công ty xuất:</span>
                    <strong className="text-xs text-[#331B08]">{workingOrder.customerCompany}</strong>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] muted font-bold">Mã số thuế:</span>
                    <strong className="text-xs text-orange-950 font-mono">MST-031782601</strong>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] muted font-bold">Địa chỉ hóa đơn:</span>
                    <strong className="text-xs text-[#331B08]">Quận 1, Thành phố Hồ Chí Minh</strong>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] muted font-bold">Trạng thái phát hành:</span>
                    <div>
                      {workingOrder.commercialStatus === "locked" ? (
                        <span className="status-pill info text-[9px]">Chờ phát hành (Chờ thanh toán)</span>
                      ) : workingOrder.paymentStatus === "paid" ? (
                        <span className="status-pill success text-[9px]">Sẵn sàng phát hành (Đã thanh toán)</span>
                      ) : (
                        <span className="status-pill warning text-[9px]">Chờ thanh toán chốt tiền</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-dashed border-orange-100 pt-3 flex justify-between items-center flex-wrap gap-2">
                  <span className="text-xs text-orange-950 font-bold">
                    Giá trị hóa đơn (gồm VAT 10%):{" "}
                    <strong className="text-orange-600">{formatVnd(quote.finalTotal)}</strong>
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="tab-button text-xs py-1.5 px-3 border-orange-200 bg-white cursor-pointer font-bold rounded-xl"
                      onClick={() => alert("Đang tải xuống bản nháp Hóa đơn đỏ PDF...")}
                    >
                      Tải hóa đơn nháp
                    </button>
                    <button
                      type="button"
                      className="primary-button text-xs py-1.5 px-4 bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer rounded-xl font-bold"
                      disabled={workingOrder.paymentStatus !== "paid"}
                      onClick={() =>
                        alert("Hóa đơn điện tử số điện tử đã được phát hành thành công và gửi tới email của đại lý!")
                      }
                    >
                      Phát hành hóa đơn điện tử
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-6 muted text-xs font-semibold">
                Đơn hàng sỉ hiện tại không có yêu cầu xuất hóa đơn đỏ từ đại lý.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. TAB CHÍNH SÁCH VÀ HẠN MỨC QUYỀN */}
      {activeTab === "settings" && (
        <section className="grid-dashboard w-full animate-fade-in">
          <div className="panel flex flex-col gap-4">
            <div className="section-title">
              <h3 className="text-lg font-bold">🛡️ Phân quyền Nhân sự theo Vai trò</h3>
            </div>
            <div className="flex flex-col gap-3">
              {Object.entries(rolePermissions).map(([role, permissions]) => (
                <div className="p-4 border-2 border-orange-100 rounded-2xl bg-[#FFFDF9]" key={role}>
                  <strong className="text-sm text-[#331B08] font-bold block">{role}</strong>
                  <p className="muted text-xs m-0 mt-0.5">{permissions.length} quyền vận hành đang hoạt động</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {permissions.map((p) => (
                      <span className="tag text-[10px] px-2 py-0.5 font-bold" key={p}>
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="panel flex flex-col gap-4">
            <div className="section-title">
              <h3 className="text-lg font-bold">⚙️ Ngưỡng tự động & Hạn mức</h3>
            </div>
            <div className="flex flex-col gap-3 text-xs text-[#331B08]">
              <div className="flex justify-between items-center p-2 border-b border-dashed border-orange-100">
                <span>Freeship toàn quốc từ:</span>
                <strong>{formatVnd(adminPolicy.freeShippingThreshold)}</strong>
              </div>
              <div className="flex justify-between items-center p-2 border-b border-dashed border-orange-100">
                <span>Tỷ lệ đặt cọc mặc định:</span>
                <strong>{percent(adminPolicy.defaultDepositRate)}</strong>
              </div>
              <div className="flex justify-between items-center p-2 border-b border-dashed border-orange-100">
                <span>Nhân viên giảm giá tối đa:</span>
                <strong>{percent(adminPolicy.maxOperatorDiscountRate)}</strong>
              </div>
              <div className="flex justify-between items-center p-2 border-b border-dashed border-orange-100">
                <span>Hạn mức cần Quản lý duyệt:</span>
                <strong>{formatVnd(adminPolicy.requireManagerApprovalAbove)}</strong>
              </div>
            </div>
            <div className="p-3 border border-orange-200 bg-orange-50/30 rounded-xl flex items-start gap-2 mt-2">
              <AlertTriangle size={15} className="text-orange-600 mt-0.5 shrink-0" />
              <p className="text-[10px] text-orange-950 m-0 leading-relaxed font-bold">
                Lưu ý an toàn dòng tiền: Tuyệt đối không cho phép chỉnh sửa trực tiếp số tiền đã được xác nhận tiền về ngân hàng. Mọi
                thay đổi sai sót phải làm qua bút toán phụ hoặc hoàn tiền.
              </p>
            </div>
          </aside>
        </section>
      )}

      {/* 4. TAB KHUYẾN MÃI & ƯU ĐÃI MẶC ĐỊNH */}
      {activeTab === "admin_promotions" && (
        <div className="flex flex-col gap-6 w-full animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#331B08] font-['Varela_Round']">⚙️ Khuyến mãi & Chỉ số mặc định</h2>
              <p className="muted text-xs font-semibold">
                Cấu hình các chỉ số ưu đãi mặc định cho đại lý khi tạo đơn sỉ tự động và các quy tắc hệ thống.
              </p>
            </div>
            <button
              type="button"
              className="tab-button text-xs py-2 px-4 border-orange-200 bg-orange-50/50 hover:bg-orange-100 cursor-pointer font-bold rounded-xl flex items-center gap-1.5"
              onClick={() => {
                fetchPromotions();
                setShowPromotionsForm(true);
              }}
            >
              ⚙️ Cấu hình Ưu đãi
            </button>
          </div>

          <div className="panel bg-[#FFFDF9] border border-orange-100 rounded-3xl p-6 w-full">
            <h4 className="text-sm font-bold text-orange-950 uppercase flex items-center gap-2 border-b pb-3 border-orange-100">
              💡 Quy tắc Khuyến mại & Vận hành đang áp dụng
            </h4>
            <ul className="text-xs text-[#331B08]/85 pl-4 flex flex-col gap-4 mt-4 list-disc leading-relaxed font-semibold">
              <li>
                Miễn phí vận chuyển cho các đơn sỉ từ <strong>{formatVnd(promotionsPolicy.freeShippingThreshold)}</strong> trở
                lên.
              </li>
              <li>
                Đại lý thanh toán trước <strong>{promotionsPolicy.defaultDepositRate * 100}%</strong> giá trị đơn sỉ làm tiền cọc
                đóng gói, <strong>{(1 - promotionsPolicy.defaultDepositRate) * 100}%</strong> COD còn lại khi nhận hàng.
              </li>
              <li>
                Nếu đơn sỉ có trị giá từ <strong>{formatVnd(promotionsPolicy.giftThreshold || 0)}</strong>, hệ thống tự động tặng
                kèm quà: <strong>{promotionsPolicy.giftName || "Chưa thiết lập"}</strong>.
              </li>
              <li>
                Nhân viên vận hành được tự động chiết khấu tối đa <strong>{promotionsPolicy.maxOperatorDiscountRate * 100}%</strong>{" "}
                hoặc giảm trực tiếp đến <strong>{formatVnd(promotionsPolicy.requireManagerApprovalAbove)}</strong> cho đại lý mà
                không cần Quản lý duyệt.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* --- PROMOTIONS CONFIG MODAL --- */}
      {showPromotionsForm && (
        <div
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm flex items-start justify-center p-4 sm:p-6 animate-fade-in"
          onClick={() => setShowPromotionsForm(false)}
        >
          <div
            className="panel max-w-lg w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <h3 className="text-base font-bold text-orange-950 m-0 font-['Varela_Round']">
                Cấu hình Khuyến mãi & Chỉ số mặc định
              </h3>
              <button
                type="button"
                className="w-6 h-6 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center text-xs font-bold hover:bg-orange-100 transition cursor-pointer"
                onClick={() => setShowPromotionsForm(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSavePromotions} className="flex flex-col gap-4 mt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">
                  Ngưỡng miễn phí vận chuyển sỉ (Freeship Threshold - VND)
                </label>
                <input
                  type="number"
                  className="text-input text-xs py-2 px-3"
                  value={promotionsPolicy.freeShippingThreshold}
                  onChange={(e) =>
                    setPromotionsPolicy({
                      ...promotionsPolicy,
                      freeShippingThreshold: Math.max(0, parseInt(e.target.value, 10) || 0)
                    })
                  }
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#78350F] uppercase">Tỷ lệ đặt cọc mặc định (Ví dụ: 0.3 = 30%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  className="text-input text-xs py-2 px-3 font-semibold"
                  value={promotionsPolicy.defaultDepositRate}
                  onChange={(e) =>
                    setPromotionsPolicy({
                      ...promotionsPolicy,
                      defaultDepositRate: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                    })
                  }
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#78350F] uppercase">
                  Chiết khấu tối đa của nhân viên (Ví dụ: 0.08 = 8%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  className="text-input text-xs py-2 px-3 font-semibold"
                  value={promotionsPolicy.maxOperatorDiscountRate}
                  onChange={(e) =>
                    setPromotionsPolicy({
                      ...promotionsPolicy,
                      maxOperatorDiscountRate: Math.max(0, Math.min(1, parseFloat(e.target.value) || 0))
                    })
                  }
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-[#78350F] uppercase">
                  Hạn mức chiết khấu cần Quản lý duyệt (VND)
                </label>
                <input
                  type="number"
                  className="text-input text-xs py-2 px-3"
                  value={promotionsPolicy.requireManagerApprovalAbove}
                  onChange={(e) =>
                    setPromotionsPolicy({
                      ...promotionsPolicy,
                      requireManagerApprovalAbove: Math.max(0, parseInt(e.target.value, 10) || 0)
                    })
                  }
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Ngưỡng tặng quà sỉ mặc định (VND)</label>
                <input
                  type="number"
                  className="text-input text-xs py-2 px-3"
                  value={promotionsPolicy.giftThreshold || 0}
                  onChange={(e) =>
                    setPromotionsPolicy({
                      ...promotionsPolicy,
                      giftThreshold: Math.max(0, parseInt(e.target.value, 10) || 0)
                    })
                  }
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Tên Quà Tặng kèm theo</label>
                <input
                  type="text"
                  className="text-input text-xs py-2 px-3"
                  placeholder="Không quà tặng"
                  value={promotionsPolicy.giftName || ""}
                  onChange={(e) =>
                    setPromotionsPolicy({
                      ...promotionsPolicy,
                      giftName: e.target.value
                    })
                  }
                />
              </div>

              <button
                type="submit"
                className="primary-button text-xs py-2.5 w-full justify-center font-bold cursor-pointer mt-2 bg-orange-500 text-white rounded-xl"
              >
                Lưu thiết lập ưu đãi
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
