"use client";

import { useState } from "react";
import { Users, UserPlus, UserCheck, X, ShieldCheck, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import type { ApiUser } from "../../types";
import { fullNameSchema, emailSchema, phoneSchema, passwordSchema, shortTextSchema } from "@/lib/validation";

interface AdminUsersProps {
  isAdmin: boolean;
  currentUser?: ApiUser | null;
  userList: ApiUser[];
  fetchUsers: () => Promise<void>;
}

export function AdminUsers({ isAdmin, currentUser, userList, fetchUsers }: AdminUsersProps) {
  const [showUserForm, setShowUserForm] = useState(false);
  const [createFullName, setCreateFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("customer_owner");
  const [createCompany, setCreateCompany] = useState("");

  // Delete modal states
  const [userToDelete, setUserToDelete] = useState<ApiUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isSuperAdmin = currentUser?.role === "super_admin";

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createFullName.trim() || !createEmail.trim() || !createPhone.trim() || !createPassword) {
      alert("Vui lòng điền đầy đủ các thông tin bắt buộc!");
      return;
    }
    if (createPassword.length < 12) {
      alert("Mật khẩu ban đầu phải có ít nhất 12 ký tự. Ví dụ: Hanni@0601PT");
      return;
    }
    try {
      const payload = {
        fullName: fullNameSchema.parse(createFullName),
        email: emailSchema.parse(createEmail),
        phone: phoneSchema.parse(createPhone),
        password: passwordSchema.parse(createPassword),
        role: createRole,
        company: createRole === "customer_owner" ? shortTextSchema("Tên tổ chức", 2, 160).parse(createCompany) : undefined
      };
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Lỗi tạo tài khoản.");
        return;
      }
      alert(data.message || "Tạo tài khoản thành công!");
      setCreateFullName("");
      setCreateEmail("");
      setCreatePhone("");
      setCreatePassword("");
      setCreateCompany("");
      await fetchUsers();
      setShowUserForm(false);
    } catch {
      alert("Lỗi kết nối server.");
    }
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/admin/users?id=${userToDelete.id}`, {
        method: "DELETE"
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Lỗi xóa tài khoản.");
        return;
      }
      alert(data.message || "Đã xóa tài khoản thành công!");
      setUserToDelete(null);
      await fetchUsers();
    } catch {
      alert("Lỗi kết nối máy chủ khi xóa tài khoản.");
    } finally {
      setIsDeleting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin":
        return "bg-rose-500/20 text-rose-300 border border-rose-500/30";
      case "admin_manager":
        return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
      case "customer_owner":
        return "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30";
      case "customer_staff":
        return "bg-blue-500/20 text-blue-300 border border-blue-500/30";
      case "order_operator":
        return "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30";
      case "accountant":
        return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
      case "warehouse":
      case "warehouse_keeper":
        return "bg-orange-500/20 text-orange-300 border border-orange-500/30";
      default:
        return "bg-gray-500/20 text-gray-300 border border-gray-500/30";
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "super_admin":
        return "Super Admin";
      case "admin_manager":
        return "Quản lý cấp cao";
      case "customer_owner":
        return "Chủ đại lý B2B";
      case "customer_staff":
        return "Nhân viên đại lý";
      case "order_operator":
        return "Nhân viên chốt đơn";
      case "accountant":
        return "Kế toán viên";
      case "warehouse":
      case "warehouse_keeper":
        return "Thủ kho";
      default:
        return "Người dùng";
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6 animate-fade-in text-xs">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#222744] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <Users size={20} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold text-white tracking-tight">
              B2B Accounts & Internal Staff RBAC
            </span>
            <span className="text-xs text-gray-400 font-medium">
              Quản lý đại lý sỉ, hạn mức tín dụng công nợ và phân quyền vận hành hệ thống
            </span>
          </div>
        </div>

        <button
          type="button"
          className="admin-pill-btn-primary text-xs py-2 px-5 flex items-center gap-1.5 cursor-pointer"
          onClick={() => setShowUserForm(true)}
        >
          <UserPlus size={15} />
          <span>+ Cấp tài khoản mới</span>
        </button>
      </div>

      {/* User Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userList.map((u) => {
          const canDelete = isSuperAdmin && u.role !== "super_admin" && u.id !== currentUser?.id;

          return (
            <div
              key={u.id}
              className="bg-[#191e36] hover:bg-[#202644] p-4 rounded-2xl border border-[#283152] transition flex flex-col justify-between gap-3 group"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-black text-white text-xs shadow-sm">
                    {u.name?.charAt(0) || "U"}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-extrabold text-white text-sm leading-tight">
                      {u.name}
                    </span>
                    <span className="text-[11px] text-indigo-300 font-medium mt-0.5">
                      {u.email}
                    </span>
                  </div>
                </div>

                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${getRoleBadge(u.role)}`}>
                  {getRoleLabel(u.role)}
                </span>
              </div>

              <div className="pt-2 border-t border-[#262e4e] flex items-center justify-between text-[11px] text-gray-400 font-mono">
                <div className="flex items-center gap-2">
                  <span>{u.phone || "—"}</span>
                  <span className="text-emerald-400 font-bold flex items-center gap-1">
                    <UserCheck size={13} /> Active
                  </span>
                </div>

                {canDelete && (
                  <button
                    type="button"
                    onClick={() => setUserToDelete(u)}
                    className="text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 p-1.5 rounded-xl border border-rose-500/30 transition flex items-center gap-1 text-[10px] font-bold cursor-pointer"
                    title="Xóa tài khoản"
                  >
                    <Trash2 size={13} />
                    <span>Xóa</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* RBAC PERMISSION MATRIX TABLE */}
      <div className="flex flex-col gap-3 mt-4">
        <div className="flex items-center gap-2 border-b border-[#222744] pb-3">
          <ShieldCheck size={18} className="text-indigo-400" />
          <div className="flex flex-col">
            <span className="font-extrabold text-sm text-white">Bảng Ma Trận Luật Phân Quyền Theo Cấp Bậc Tài Khoản (RBAC)</span>
            <span className="text-xs text-gray-400 font-medium">Chi tiết quyền hạn vận hành và phê duyệt trên 7 cấp độ tài khoản</span>
          </div>
        </div>

        <div className="bg-[#171b30] p-4 rounded-2xl border border-[#272e4e] overflow-x-auto w-full">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                <th className="py-3 px-3 min-w-[200px]">Nhóm Quyền Hạn</th>
                <th className="py-3 px-2 text-center text-rose-300">Super Admin</th>
                <th className="py-3 px-2 text-center text-amber-300">Quản lý (Manager)</th>
                <th className="py-3 px-2 text-center text-indigo-300">Nhân viên chốt đơn</th>
                <th className="py-3 px-2 text-center text-emerald-300">Kế toán viên</th>
                <th className="py-3 px-2 text-center text-sky-300">Thủ kho</th>
                <th className="py-3 px-2 text-center text-purple-300">Chủ đại lý B2B</th>
                <th className="py-3 px-2 text-center text-gray-400">NV Đại lý</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232a48]">
              {/* 1. Kho & Sản phẩm */}
              <tr className="hover:bg-[#1d2340]/60">
                <td className="py-3 px-3 font-bold text-white">
                  📦 Xem danh mục & Giá sỉ
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xem giá sỉ</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xem giá vốn/sỉ</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xem tồn kho</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xem giá sỉ</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xem giá sỉ</td>
              </tr>

              <tr className="hover:bg-[#1d2340]/60">
                <td className="py-3 px-3 font-bold text-white">
                  ✏️ Tạo, sửa, xóa Sản phẩm & Tồn kho
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-indigo-400 font-bold">✓ Nhập/Xuất kho</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
              </tr>

              {/* 2. Đơn hàng & Chiết khấu */}
              <tr className="hover:bg-[#1d2340]/60">
                <td className="py-3 px-3 font-bold text-white">
                  📑 Lên đơn sỉ & Chốt báo giá
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Duyệt mọi đơn</td>
                <td className="py-3 px-2 text-center text-indigo-400 font-bold">✓ Chốt đơn sỉ</td>
                <td className="py-3 px-2 text-center text-gray-400">Xem đơn</td>
                <td className="py-3 px-2 text-center text-gray-400">Xem đóng gói</td>
                <td className="py-3 px-2 text-center text-purple-400 font-bold">✓ Đặt đơn sỉ</td>
                <td className="py-3 px-2 text-center text-gray-400">Tạo giỏ hàng</td>
              </tr>

              <tr className="hover:bg-[#1d2340]/60">
                <td className="py-3 px-3 font-bold text-white">
                  ⚡ Giảm giá & Duyệt chiết khấu lớn (&gt;8%)
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Phê duyệt tối cao</td>
                <td className="py-3 px-2 text-center text-amber-400 font-bold">⚡ Duyệt đến 15%</td>
                <td className="py-3 px-2 text-center text-indigo-400 font-bold">Tối đa 8% (500k)</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
              </tr>

              {/* 3. Kế toán & Sổ cái */}
              <tr className="hover:bg-[#1d2340]/60">
                <td className="py-3 px-3 font-bold text-white">
                  💰 Xác nhận tiền cọc & Thu đủ
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xác nhận cọc</td>
                <td className="py-3 px-2 text-center text-indigo-400 font-bold">Nhận ủy nhiệm chi</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xác nhận tiền về</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-purple-400">Tải bill chuyển khoản</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
              </tr>

              <tr className="hover:bg-[#1d2340]/60">
                <td className="py-3 px-3 font-bold text-white">
                  📊 Hạch toán Sổ cái (112, 131, 511, 632)
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xem & Kiểm tra</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Hạch toán & Khóa sổ</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
              </tr>

              {/* 4. Cấu hình & Quản trị */}
              <tr className="hover:bg-[#1d2340]/60">
                <td className="py-3 px-3 font-bold text-white">
                  ⚙️ Cấu hình Bảng giá, Chiết khấu & RBAC
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-amber-400 font-bold">Xem & Đề xuất</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Cấp tài khoản mới (Dark Glass Theme) */}
      {showUserForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-indigo-400" />
                <h3 className="font-extrabold text-white text-base m-0">Cấp tài khoản B2B / Nhân viên</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer"
                onClick={() => setShowUserForm(false)}
              >
                <X size={14} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-300">Họ và tên</label>
                <input
                  type="text"
                  className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                  placeholder="Nguyễn Văn A"
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-300">Email đăng nhập</label>
                <input
                  type="email"
                  className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                  placeholder="daily@doanhnghiep.vn"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-300">Số điện thoại</label>
                  <input
                    type="tel"
                    className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                    placeholder="0912345678"
                    value={createPhone}
                    onChange={(e) => setCreatePhone(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-300">Vai trò</label>
                  <select
                    className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value)}
                  >
                    <option value="customer_owner">Đại lý sỉ B2B</option>
                    <option value="order_operator">Nhân viên chốt đơn</option>
                    <option value="accountant">Kế toán viên</option>
                    <option value="warehouse_keeper">Thủ kho</option>
                    <option value="admin_manager">Quản lý cấp cao</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-300">Mật khẩu ban đầu (tối thiểu 12 ký tự)</label>
                <input
                  type="password"
                  className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs"
                  placeholder="••••••••••••"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  required
                />
              </div>

              <div className="flex justify-end gap-2.5 mt-2 border-t border-[#232a48] pt-3">
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl text-gray-300 hover:text-white cursor-pointer"
                  onClick={() => setShowUserForm(false)}
                >
                  Hủy
                </button>
                <button type="submit" className="admin-pill-btn-primary text-xs py-2 px-6 cursor-pointer">
                  Xác nhận cấp tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete User Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#15192e] border border-rose-500/30 rounded-3xl w-full max-w-md p-6 flex flex-col gap-4 shadow-2xl shadow-rose-950/40">
            <div className="flex items-center justify-between pb-3 border-b border-[#232a48]">
              <div className="flex items-center gap-2.5 text-rose-400">
                <div className="p-2 rounded-xl bg-rose-500/20 border border-rose-500/30">
                  <AlertTriangle size={20} />
                </div>
                <span className="font-extrabold text-sm text-white">Xác nhận xóa tài khoản</span>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setUserToDelete(null)}
                className="text-gray-400 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-[#1a1f38] border border-[#2b3356] flex flex-col gap-2.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-500 flex items-center justify-center font-black text-white text-xs shadow-sm">
                  {userToDelete.name?.charAt(0) || "U"}
                </div>
                <div className="flex flex-col">
                  <span className="font-extrabold text-white text-sm">{userToDelete.name}</span>
                  <span className="text-xs text-indigo-300 font-mono">{userToDelete.email}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-[#252c4a] text-[11px] text-gray-400">
                <span className="font-semibold">Vai trò:</span>
                <span className="text-white font-bold">{getRoleLabel(userToDelete.role)}</span>
                {userToDelete.phone && <span>• SĐT: {userToDelete.phone}</span>}
              </div>
            </div>

            <div className="text-xs text-rose-300/90 bg-rose-500/10 p-3 rounded-2xl border border-rose-500/20 leading-relaxed">
              ⚠️ <strong>Cảnh báo quản trị:</strong> Thao tác này sẽ ngay lập tức thu hồi toàn bộ phiên đăng nhập và xóa quyền truy cập của tài khoản này khỏi nền tảng Pet Travel Wholesale.
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-[#232a48]">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 rounded-xl text-gray-300 hover:text-white cursor-pointer transition font-medium"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2 rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/30"
              >
                {isDeleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                <span>{isDeleting ? "Đang xóa..." : "Xác nhận xóa tài khoản"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
