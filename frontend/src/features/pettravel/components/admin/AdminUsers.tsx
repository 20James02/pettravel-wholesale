"use client";

import { useState, useEffect, useRef } from "react";
import { Users, UserPlus, UserCheck, X, ShieldCheck, Trash2, AlertTriangle, Loader2, Check } from "lucide-react";
import type { ApiUser } from "../../types";
import {
  fullNameSchema,
  emailSchema,
  phoneSchema,
  passwordSchema,
  optionalCompanySchema,
  getValidationErrorMessage
} from "@/lib/validation";

interface AdminUsersProps {
  isAdmin: boolean;
  currentUser?: ApiUser | null;
  userList: ApiUser[];
  fetchUsers: () => Promise<void>;
}

export function AdminUsers({ isAdmin, currentUser, userList, fetchUsers }: AdminUsersProps) {
  const userModalRef = useRef<HTMLDivElement>(null);
  const deleteModalRef = useRef<HTMLDivElement>(null);

  const [showUserForm, setShowUserForm] = useState(false);
  const [createFullName, setCreateFullName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState("customer_owner");
  const [createCompany, setCreateCompany] = useState("");
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [serverErrorMsg, setServerErrorMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toastMsg, setToastMsg] = useState("");

  // Delete modal states
  const [userToDelete, setUserToDelete] = useState<ApiUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isSuperAdmin = currentUser?.role === "super_admin";

  // Lock body scroll and active scroll to top when popup opens
  useEffect(() => {
    if (showUserForm || userToDelete) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [showUserForm, userToDelete]);

  useEffect(() => {
    if (showUserForm && userModalRef.current) {
      userModalRef.current.scrollTop = 0;
    }
  }, [showUserForm]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 4000);
  };

  const validateUserInputs = (
    fullName: string,
    email: string,
    phone: string,
    password: string,
    role: string,
    company: string
  ): Record<string, string> => {
    const errors: Record<string, string> = {};

    const fnRes = fullNameSchema.safeParse(fullName.trim());
    if (!fnRes.success) {
      errors.fullName = getValidationErrorMessage(fnRes.error, "Họ và tên không hợp lệ (tối thiểu 2 ký tự).");
    }

    const emRes = emailSchema.safeParse(email.trim().toLowerCase());
    if (!emRes.success) {
      errors.email = getValidationErrorMessage(emRes.error, "Email đăng nhập không đúng định dạng.");
    }

    const phRes = phoneSchema.safeParse(phone.trim());
    if (!phRes.success) {
      errors.phone = "Số điện thoại không hợp lệ (Dùng dạng 0xxxxxxxxx hoặc +84xxxxxxxxx).";
    }

    const pwRes = passwordSchema.safeParse(password);
    if (!pwRes.success) {
      errors.password = getValidationErrorMessage(pwRes.error, "Mật khẩu phải từ 12 ký tự trở lên, gồm cả chữ và số.");
    }

    if (role === "customer_owner" && company.trim()) {
      const cpRes = optionalCompanySchema.safeParse(company.trim());
      if (!cpRes.success) {
        errors.company = getValidationErrorMessage(cpRes.error, "Tên doanh nghiệp / đại lý không hợp lệ.");
      }
    }

    return errors;
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerErrorMsg("");

    const errors = validateUserInputs(createFullName, createEmail, createPhone, createPassword, createRole, createCompany);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        fullName: createFullName.trim(),
        email: createEmail.trim().toLowerCase(),
        phone: createPhone.trim(),
        password: createPassword,
        role: createRole,
        company: createRole === "customer_owner" ? createCompany.trim() || undefined : undefined
      };

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        const errorText = data.error || "Lỗi tạo tài khoản.";
        setServerErrorMsg(errorText);
        if (errorText.toLowerCase().includes("email")) {
          setFormErrors((prev) => ({ ...prev, email: errorText }));
        } else if (errorText.toLowerCase().includes("số điện thoại") || errorText.toLowerCase().includes("phone")) {
          setFormErrors((prev) => ({ ...prev, phone: errorText }));
        }
        return;
      }

      showToast(data.message || "Tạo tài khoản thành công!");
      setCreateFullName("");
      setCreateEmail("");
      setCreatePhone("");
      setCreatePassword("");
      setCreateCompany("");
      setFormErrors({});
      setServerErrorMsg("");
      await fetchUsers();
      setShowUserForm(false);
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error("Không thể kết nối máy chủ");
      setServerErrorMsg(`Lỗi kết nối máy chủ: ${errorObj.message}`);
    } finally {
      setIsSubmitting(false);
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
      showToast(data.message || "Đã xóa tài khoản thành công!");
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
          onClick={() => {
            setFormErrors({});
            setServerErrorMsg("");
            setShowUserForm(true);
          }}
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
                  📦 Quản lý Kho & Danh mục Sản phẩm
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Thêm/Sửa</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xem tồn kho</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Xem tồn kho</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Nhập/Xuất kho</td>
                <td className="py-3 px-2 text-center text-gray-400">Xem giá sỉ</td>
                <td className="py-3 px-2 text-center text-gray-400">Xem giá sỉ</td>
              </tr>

              {/* 2. Đơn hàng B2B */}
              <tr className="hover:bg-[#1d2340]/60">
                <td className="py-3 px-3 font-bold text-white">
                  🛒 Đơn hàng & Báo giá Chiết khấu B2B
                </td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Toàn quyền</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Duyệt báo giá</td>
                <td className="py-3 px-2 text-center text-emerald-400 font-bold">✓ Tạo/Sửa báo giá</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-gray-500">✕</td>
                <td className="py-3 px-2 text-center text-purple-400 font-bold">Tạo & Duyệt đơn</td>
                <td className="py-3 px-2 text-center text-purple-300 font-bold">Tạo đơn nháp</td>
              </tr>

              {/* 3. Kế toán & Thanh toán */}
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
          <div ref={userModalRef} className="bg-[#14182b] border border-[#272e4e] rounded-3xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto admin-dark-scroll">
            <div className="flex items-center justify-between border-b border-[#232a48] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus size={18} className="text-indigo-400" />
                <h3 className="font-extrabold text-white text-base m-0">Cấp tài khoản B2B / Nhân viên</h3>
              </div>
              <button
                type="button"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-gray-300 cursor-pointer transition"
                onClick={() => setShowUserForm(false)}
              >
                <X size={14} />
              </button>
            </div>

            {serverErrorMsg && (
              <div className="bg-rose-500/20 border border-rose-500/40 rounded-2xl p-3 text-rose-300 text-xs flex items-center gap-2 animate-fade-in">
                <AlertTriangle size={16} className="shrink-0 text-rose-400" />
                <span>{serverErrorMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-300 flex justify-between">
                  <span>Họ và tên</span>
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  className={`w-full mt-1 bg-[#1c223c] border transition-all ${
                    formErrors.fullName ? "border-rose-500 bg-rose-950/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500" : "border-[#2c365c]"
                  } rounded-xl py-2 px-3 text-white text-xs outline-hidden`}
                  placeholder="Ví dụ: Nguyễn Văn A"
                  value={createFullName}
                  onChange={(e) => {
                    setCreateFullName(e.target.value);
                    if (formErrors.fullName) {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.fullName;
                        return next;
                      });
                    }
                  }}
                  required
                />
                {formErrors.fullName && (
                  <span className="text-[10px] text-rose-400 font-semibold mt-1 block animate-fade-in">
                    ⚠️ {formErrors.fullName}
                  </span>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-300 flex justify-between">
                  <span>Email đăng nhập</span>
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  className={`w-full mt-1 bg-[#1c223c] border transition-all ${
                    formErrors.email ? "border-rose-500 bg-rose-950/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500" : "border-[#2c365c]"
                  } rounded-xl py-2 px-3 text-white text-xs outline-hidden`}
                  placeholder="daily@doanhnghiep.vn"
                  value={createEmail}
                  onChange={(e) => {
                    setCreateEmail(e.target.value);
                    if (formErrors.email) {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.email;
                        return next;
                      });
                    }
                  }}
                  required
                />
                {formErrors.email && (
                  <span className="text-[10px] text-rose-400 font-semibold mt-1 block animate-fade-in">
                    ⚠️ {formErrors.email}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-300 flex justify-between">
                    <span>Số điện thoại</span>
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    className={`w-full mt-1 bg-[#1c223c] border transition-all ${
                      formErrors.phone ? "border-rose-500 bg-rose-950/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500" : "border-[#2c365c]"
                    } rounded-xl py-2 px-3 text-white text-xs outline-hidden`}
                    placeholder="0912345678"
                    value={createPhone}
                    onChange={(e) => {
                      setCreatePhone(e.target.value);
                      if (formErrors.phone) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.phone;
                          return next;
                        });
                      }
                    }}
                    required
                  />
                  {formErrors.phone && (
                    <span className="text-[10px] text-rose-400 font-semibold mt-1 block animate-fade-in">
                      ⚠️ {formErrors.phone}
                    </span>
                  )}
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-300">Vai trò</label>
                  <select
                    className="w-full mt-1 bg-[#1c223c] border border-[#2c365c] rounded-xl py-2 px-3 text-white text-xs outline-hidden"
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

              {createRole === "customer_owner" && (
                <div className="animate-fade-in">
                  <label className="text-[11px] font-bold text-gray-300 flex justify-between">
                    <span>Tên đại lý / Doanh nghiệp (Tùy chọn)</span>
                  </label>
                  <input
                    type="text"
                    className={`w-full mt-1 bg-[#1c223c] border transition-all ${
                      formErrors.company ? "border-rose-500 bg-rose-950/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500" : "border-[#2c365c]"
                    } rounded-xl py-2 px-3 text-white text-xs outline-hidden`}
                    placeholder="Ví dụ: Pet Shop Hạnh Phúc, Đại lý Tân Bình..."
                    value={createCompany}
                    onChange={(e) => {
                      setCreateCompany(e.target.value);
                      if (formErrors.company) {
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.company;
                          return next;
                        });
                      }
                    }}
                  />
                  {formErrors.company && (
                    <span className="text-[10px] text-rose-400 font-semibold mt-1 block animate-fade-in">
                      ⚠️ {formErrors.company}
                    </span>
                  )}
                </div>
              )}

              <div>
                <label className="text-[11px] font-bold text-gray-300 flex justify-between">
                  <span>Mật khẩu ban đầu (tối thiểu 12 ký tự)</span>
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="password"
                  className={`w-full mt-1 bg-[#1c223c] border transition-all ${
                    formErrors.password ? "border-rose-500 bg-rose-950/20 focus:border-rose-500 focus:ring-1 focus:ring-rose-500" : "border-[#2c365c]"
                  } rounded-xl py-2 px-3 text-white text-xs outline-hidden`}
                  placeholder="Gồm cả chữ và số (ví dụ: Matkhau@12345)"
                  value={createPassword}
                  onChange={(e) => {
                    setCreatePassword(e.target.value);
                    if (formErrors.password) {
                      setFormErrors((prev) => {
                        const next = { ...prev };
                        delete next.password;
                        return next;
                      });
                    }
                  }}
                  required
                />
                {formErrors.password && (
                  <span className="text-[10px] text-rose-400 font-semibold mt-1 block animate-fade-in">
                    ⚠️ {formErrors.password}
                  </span>
                )}
              </div>

              <div className="flex justify-end gap-2.5 mt-2 border-t border-[#232a48] pt-3">
                <button
                  type="button"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-gray-300 hover:text-white cursor-pointer transition font-medium"
                  onClick={() => setShowUserForm(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="admin-pill-btn-primary text-xs py-2 px-6 cursor-pointer flex items-center gap-2"
                >
                  {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                  <span>{isSubmitting ? "Đang xử lý..." : "Xác nhận cấp tài khoản"}</span>
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

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-xl font-bold text-xs flex items-center gap-2 animate-fade-in">
          <Check size={16} />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
