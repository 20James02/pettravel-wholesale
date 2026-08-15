"use client";

import { useState } from "react";
import { Users, UserPlus, UserCheck, X } from "lucide-react";
import type { ApiUser } from "../../types";
import { fullNameSchema, emailSchema, phoneSchema, passwordSchema, shortTextSchema } from "@/lib/validation";

interface AdminUsersProps {
  isAdmin: boolean;
  userList: ApiUser[];
  fetchUsers: () => Promise<void>;
}

export function AdminUsers({ isAdmin, userList, fetchUsers }: AdminUsersProps) {
  const [showUserForm, setShowUserForm] = useState(false);
  const [createFullName, setCreateFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("customer_owner");
  const [createCompany, setCreateCompany] = useState("");

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
          className="admin-pill-btn-primary text-xs py-2 px-5 flex items-center gap-1.5"
          onClick={() => setShowUserForm(true)}
        >
          <UserPlus size={15} />
          <span>+ Cấp tài khoản mới</span>
        </button>
      </div>

      {/* User Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {userList.map((u) => (
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

              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                  u.role === "super_admin"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : u.role === "admin_manager"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                    : "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                }`}
              >
                {u.role === "super_admin"
                  ? "Super Admin"
                  : u.role === "admin_manager"
                  ? "Manager"
                  : u.role === "customer_owner"
                  ? "Đại lý B2B"
                  : "Nhân viên"}
              </span>
            </div>

            <div className="pt-2 border-t border-[#262e4e] flex items-center justify-between text-[11px] text-gray-400 font-mono">
              <span>{u.phone || "—"}</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <UserCheck size={13} /> Active
              </span>
            </div>
          </div>
        ))}
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
                <button type="submit" className="admin-pill-btn-primary text-xs py-2 px-6">
                  Xác nhận cấp tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
