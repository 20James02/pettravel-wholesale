import { useState } from "react";
import Image from "next/image";
import { Users } from "lucide-react";
import type { ApiUser } from "../../types";
import { fullNameSchema, emailSchema, phoneSchema, passwordSchema, shortTextSchema } from "@/lib/validation";

interface AdminUsersProps {
  isAdmin: boolean;
  userList: ApiUser[];
  fetchUsers: () => Promise<void>;
}

export function AdminUsers({ isAdmin, userList, fetchUsers }: AdminUsersProps) {
  // Local state for user form
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
      alert("Lỗi kết nối.");
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-6 animate-fade-in w-full text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#331B08] font-['Varela_Round']">👥 Quản lý thành viên hệ thống</h2>
          <p className="muted text-xs font-semibold">Quản lý và phân quyền tài khoản của đại lý sỉ, operator, admin và kế toán tài chính.</p>
        </div>
        <button
          type="button"
          className="tab-button text-xs py-2 px-4 border-orange-200 bg-orange-50/50 hover:bg-orange-100 cursor-pointer font-bold rounded-xl flex items-center gap-1.5"
          onClick={() => {
            setCreateFullName("");
            setCreateEmail("");
            setCreatePhone("");
            setCreatePassword("");
            setCreateCompany("");
            setCreateRole("customer_owner");
            setShowUserForm(true);
          }}
        >
          + Tạo tài khoản mới
        </button>
      </div>

      {/* Danh sách thành viên rộng 100% */}
      <div className="panel flex flex-col gap-4 bg-white border border-orange-100 rounded-3xl p-6 w-full">
        <h3 className="text-lg font-bold text-[#331B08] flex items-center gap-2 font-['Varela_Round']">
          <Users className="text-orange-500" size={20} />
          Thành viên hệ thống ({userList.length})
        </h3>
        <p className="muted text-xs font-semibold">Danh sách toàn bộ tài khoản đại lý sỉ, nhân viên kế toán, tài chính và điều phối viên đang hoạt động.</p>

        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-orange-100 text-[10px] font-extrabold uppercase text-[#78350F] tracking-wider">
                <th className="py-2.5">Thành viên</th>
                <th>Số điện thoại</th>
                <th>Tổ chức sỉ / Vai trò</th>
                <th>Phân loại</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-orange-50/50">
              {userList.map((u) => (
                <tr key={u.id} className="text-xs hover:bg-orange-50/20">
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-orange-50 flex items-center justify-center font-bold text-orange-750 text-xs shrink-0 border border-orange-200">
                        {u.avatarUrl ? (
                          <Image src={u.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
                        ) : (
                          u.name?.charAt(0) || "U"
                        )}
                      </div>
                      <div className="flex flex-col">
                        <strong className="text-[#331B08]">{u.name}</strong>
                        <span className="text-[10px] text-gray-400 font-semibold">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="font-semibold text-gray-600">{u.phone || "—"}</td>
                  <td>
                    <div className="flex flex-col">
                      <strong className="text-[#78350F]">{u.company || "Pet Travel Nội bộ"}</strong>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{u.role}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`status-pill text-[9px] ${u.role.includes("admin") ? "success" : "info"}`}>
                      {u.role.includes("admin") ? "Nội bộ Admin" : "Đại lý ngoài"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Popup Form Modal for creating user */}
      {showUserForm && (
        <div
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
          onClick={() => setShowUserForm(false)}
        >
          <div
            className="panel max-w-md w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <h3 className="text-base font-bold text-orange-950 m-0 font-['Varela_Round']">Tạo tài khoản thành viên mới</h3>
              <button
                type="button"
                className="w-6 h-6 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center text-xs font-bold hover:bg-orange-100 transition cursor-pointer"
                onClick={() => setShowUserForm(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="flex flex-col gap-4 mt-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Họ và Tên</label>
                <input
                  type="text"
                  className="text-input text-xs py-2 px-3"
                  value={createFullName}
                  onChange={(e) => setCreateFullName(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Email đăng nhập</label>
                <input
                  type="email"
                  className="text-input text-xs py-2 px-3"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Số điện thoại</label>
                <input
                  type="tel"
                  className="text-input text-xs py-2 px-3"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Mật khẩu ban đầu</label>
                <input
                  type="password"
                  className="text-input text-xs py-2 px-3"
                  placeholder="Tối thiểu 12 ký tự"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  required
                  minLength={12}
                  autoComplete="new-password"
                />
                <span className="text-[9px] text-gray-400">Mật khẩu cần tối thiểu 12 ký tự để đảm bảo an toàn.</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Vai trò & Quyền</label>
                <select
                  className="text-input text-xs py-2 px-3 bg-white border border-orange-200"
                  value={createRole}
                  onChange={(e) => setCreateRole(e.target.value)}
                >
                  <option value="customer_owner">Đại lý sỉ (Customer Owner)</option>
                  <option value="super_admin">Quản trị cấp cao (Super Admin)</option>
                  <option value="finance_admin">Tài chính (Finance Admin)</option>
                  <option value="operator">Nhân viên vận hành (Operator)</option>
                </select>
              </div>

              {createRole === "customer_owner" && (
                <div className="flex flex-col gap-1.5 animate-slide-down">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Tên Công ty/Cửa hàng</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3"
                    placeholder="Ví dụ: Happy Paws Shop"
                    value={createCompany}
                    onChange={(e) => setCreateCompany(e.target.value)}
                    required={createRole === "customer_owner"}
                  />
                </div>
              )}

              <button
                type="submit"
                className="primary-button text-xs py-2.5 w-full justify-center font-bold cursor-pointer mt-2 bg-orange-500 text-white rounded-xl"
              >
                Tạo tài khoản
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
