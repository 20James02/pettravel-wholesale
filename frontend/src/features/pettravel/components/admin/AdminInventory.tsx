import { useState } from "react";
import Image from "next/image";
import { AlertTriangle, Boxes, PackageCheck, RefreshCw, WalletCards } from "lucide-react";
import type { Product, Supplier, OperationsOverview, ProductVariant, OperationsDocumentType } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { StatusPill } from "../ui/StatusPill";
import { productSchema, supplierSchema } from "@/lib/validation";
import { getValidationErrorMessage } from "@/lib/validation";
import { ImageUploader } from "@/features/pettravel/components/product/ImageUploader";
import { VariantImageUploader } from "@/features/pettravel/components/product/VariantImageUploader";

interface AdminInventoryProps {
  activeTab: string;
  isAdmin: boolean;
  allProducts: Product[];
  suppliers: Supplier[];
  allCategories: string[];
  operationsOverview: OperationsOverview | null;
  isOperationsLoading: boolean;
  overviewError: string;
  fetchProducts: () => Promise<void>;
  fetchSuppliers: () => Promise<void>;
  fetchCategories: () => Promise<void>;
  fetchOperationsOverview: () => Promise<void>;
  syncVariantSkus: (productCode: string, variants: ProductVariant[]) => ProductVariant[];
}

export function AdminInventory({
  activeTab,
  isAdmin,
  allProducts,
  suppliers,
  allCategories,
  operationsOverview,
  isOperationsLoading,
  overviewError,
  fetchProducts,
  fetchSuppliers,
  fetchCategories,
  fetchOperationsOverview,
  syncVariantSkus
}: AdminInventoryProps) {
  // --- LOCAL STATES FOR PRODUCT FORM ---
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formProductSupplier, setFormProductSupplier] = useState("");
  const [formImage, setFormImage] = useState("/product-food.svg");
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formDimensions, setFormDimensions] = useState("");
  const [formWeight, setFormWeight] = useState(0);
  const [formDescription, setFormDescription] = useState("");
  const [formTags, setFormTags] = useState("");
  const [formVariants, setFormVariants] = useState<ProductVariant[]>([]);

  // --- LOCAL STATES FOR CATEGORY ---
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategoryOld, setEditingCategoryOld] = useState<string | null>(null);
  const [editingCategoryNew, setEditingCategoryNew] = useState("");

  // --- LOCAL STATES FOR SUPPLIER ---
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supCode, setSupCode] = useState("");
  const [supName, setSupName] = useState("");
  const [supLeadTime, setSupLeadTime] = useState(3);
  const [supAdminOnly, setSupAdminOnly] = useState(true);

  // --- LOCAL STATES FOR OPERATIONS ---
  const [showOperationsForm, setShowOperationsForm] = useState(false);
  const [operationType, setOperationType] = useState<OperationsDocumentType>("purchase_receipt");
  const [operationPartner, setOperationPartner] = useState("");
  const [operationSku, setOperationSku] = useState("");
  const [operationDescription, setOperationDescription] = useState("");
  const [operationQuantity, setOperationQuantity] = useState(1);
  const [operationUnitCost, setOperationUnitCost] = useState(0);
  const [operationExpenseCategory, setOperationExpenseCategory] = useState("Chi phí phát sinh");
  const [operationExpenseAmount, setOperationExpenseAmount] = useState(0);
  const [operationPostNow, setOperationPostNow] = useState(false);
  const [operationsError, setOperationsError] = useState("");

  // Utility labels for document types
  const operationsTypeLabel = (type: OperationsDocumentType): string => {
    const labels: Record<OperationsDocumentType, string> = {
      purchase_receipt: "Phiếu nhập hàng",
      sales_invoice: "Hóa đơn bán hàng",
      expense: "Chi phí phát sinh",
      defect_report: "Hàng lỗi / hư hỏng",
      stock_adjustment: "Kiểm kê / điều chỉnh"
    };
    return labels[type];
  };

  // --- LOGIC HANDLERS ---
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategory) {
      alert("Vui lòng chọn danh mục sản phẩm!");
      return;
    }

    const cleanCode = formCode.trim().toUpperCase();
    if (!editingProduct && allProducts.some((p) => p.code.toUpperCase() === cleanCode)) {
      alert(`Mã sản phẩm "${formCode}" đã tồn tại trong danh sách. Vui lòng nhập mã sản phẩm khác!`);
      return;
    }
    if (editingProduct && allProducts.some((p) => p.id !== editingProduct.id && p.code.toUpperCase() === cleanCode)) {
      alert(`Mã sản phẩm "${formCode}" đã trùng với một sản phẩm khác. Vui lòng nhập mã sản phẩm khác!`);
      return;
    }

    const productData = {
      id: editingProduct?.id || `p_${Date.now()}`,
      code: formCode,
      name: formName,
      category: formCategory,
      brand: "Pet Travel",
      imageUrl: formImage || "/product-food.svg",
      images: formImages.length > 0 ? formImages : [formImage || "/product-food.svg"],
      dimensions: formDimensions,
      weight: Number(formWeight) || 0,
      description: formDescription,
      tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
      variants: formVariants.map((v) => ({
        ...v,
        supplierId: formProductSupplier || v.supplierId || suppliers[0]?.id || "sup_pettravel"
      }))
    };

    const preflight = productSchema.safeParse(productData);
    if (!preflight.success) {
      alert(getValidationErrorMessage(preflight.error, "Dữ liệu sản phẩm không hợp lệ."));
      return;
    }

    try {
      const validated = productSchema.parse(productData);
      const res = await fetch("/api/products", {
        method: editingProduct ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated)
      });
      if (res.ok) {
        await fetchProducts();
        setShowProductForm(false);
      } else {
        const errData = await res.json();
        alert(errData.error || "Lỗi khi lưu sản phẩm.");
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("KhÃ´ng thá»ƒ thá»±c hiá»‡n yÃªu cáº§u.");
      alert(`Lỗi kết nối máy chủ: ${err.message || "Không thể thực hiện yêu cầu."}`);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() })
      });
      if (res.ok) {
        await fetchCategories();
        setShowCategoryForm(false);
        setNewCategoryName("");
      } else {
        const err = await res.json();
        alert(err.error || "Lỗi khi thêm danh mục.");
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("KhÃ´ng thá»ƒ thá»±c hiá»‡n yÃªu cáº§u.");
      alert(`Lỗi kết nối: ${err.message}`);
    }
  };

  const handleEditCategory = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) {
      setEditingCategoryOld(null);
      return;
    }

    try {
      const res = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oldName, newName: newName.trim() })
      });
      if (res.ok) {
        await fetchCategories();
        setEditingCategoryOld(null);
      } else {
        const err = await res.json();
        alert(err.error || "Lỗi khi sửa danh mục.");
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("KhÃ´ng thá»ƒ thá»±c hiá»‡n yÃªu cáº§u.");
      alert(`Lỗi kết nối: ${err.message}`);
    }
  };

  const handleDeleteCategory = async (name: string) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa danh mục "${name}"? Các sản phẩm thuộc danh mục này sẽ hiển thị 'Chưa phân loại'.`)) return;

    try {
      const res = await fetch(`/api/categories?name=${encodeURIComponent(name)}`, { method: "DELETE" });
      if (res.ok) {
        await fetchCategories();
      } else {
        const err = await res.json();
        alert(err.error || "Lỗi khi xóa danh mục.");
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("KhÃ´ng thá»ƒ thá»±c hiá»‡n yÃªu cáº§u.");
      alert(`Lỗi kết nối: ${err.message}`);
    }
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supCode.trim() || !supName.trim()) {
      alert("Vui lòng điền đủ Mã và Tên nhà cung cấp!");
      return;
    }

    const payload = {
      id: editingSupplier?.id || `sup_${Date.now()}`,
      code: supCode.trim().toUpperCase(),
      name: supName.trim(),
      leadTimeDays: Number(supLeadTime) || 3,
      adminOnly: supAdminOnly
    };

    const preflight = supplierSchema.safeParse(payload);
    if (!preflight.success) {
      alert(getValidationErrorMessage(preflight.error, "Dữ liệu nhà cung cấp không hợp lệ."));
      return;
    }

    try {
      const validated = supplierSchema.parse(payload);
      const res = await fetch("/api/suppliers", {
        method: editingSupplier ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated)
      });
      if (res.ok) {
        await fetchSuppliers();
        setShowSupplierForm(false);
        setEditingSupplier(null);
      } else {
        const err = await res.json();
        alert(err.error || "Lỗi khi lưu nhà cung cấp.");
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("KhÃ´ng thá»ƒ thá»±c hiá»‡n yÃªu cáº§u.");
      alert(`Lỗi kết nối: ${err.message}`);
    }
  };

  const handleDeleteSupplier = async (id: string, name: string) => {
    if (!confirm(`Xóa nhà cung cấp "${name}"? Các SKU thuộc nhà cung cấp này sẽ tự động chuyển về Pet Travel nội bộ.`)) return;

    try {
      const res = await fetch(`/api/suppliers?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchSuppliers();
      } else {
        const err = await res.json();
        alert(err.error || "Lỗi khi xóa nhà cung cấp.");
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("KhÃ´ng thá»ƒ thá»±c hiá»‡n yÃªu cáº§u.");
      alert(`Lỗi kết nối: ${err.message}`);
    }
  };

  const handleCreateOperationsDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setOperationsError("");

    const payload = {
      id: `ops_${Date.now()}`,
      type: operationType,
      partnerName: operationPartner.trim() || undefined,
      description: operationDescription.trim() || undefined,
      sku: operationType !== "expense" ? operationSku.trim() : undefined,
      quantity: operationType !== "expense" ? Number(operationQuantity) : undefined,
      unitCost: operationType !== "expense" ? Number(operationUnitCost) : undefined,
      expenseCategory: operationType === "expense" ? operationExpenseCategory.trim() : undefined,
      expenseAmount: operationType === "expense" ? Number(operationExpenseAmount) : undefined,
      postNow: operationPostNow
    };

    try {
      const res = await fetch("/api/admin/operations/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        await fetchOperationsOverview();
        setShowOperationsForm(false);
      } else {
        const data = await res.json();
        setOperationsError(data.error || "Lỗi khi xử lý chứng từ vận hành.");
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("KhÃ´ng thá»ƒ thá»±c hiá»‡n yÃªu cáº§u.");
      setOperationsError(`Lỗi kết nối server: ${err.message}`);
    }
  };

  // --- RENDER COMPONENT TABS ---
  if (!isAdmin) return null;

  return (
    <div className="flex flex-col gap-6 animate-fade-in w-full">
      {/* 1. TAB QUẢN LÝ SẢN PHẨM */}
      {activeTab === "admin_products" && (
        <div className="admin-dark-dock w-full p-4 sm:p-6 lg:p-7 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#222744] pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                <Boxes size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-extrabold text-white tracking-tight">
                  Product Catalog & ATP Inventory Balances
                </span>
                <span className="text-xs text-gray-400 font-medium">
                  Cập nhật danh mục sản phẩm, biến thể sỉ và tồn kho khả dụng Available-to-Promise
                </span>
              </div>
            </div>
            <button
              type="button"
              className="admin-pill-btn-primary text-xs py-2 px-5"
              onClick={() => {
                setEditingProduct(null);
                const nextCode = `PRO-${Date.now().toString().slice(-4)}`;
                setFormCode(nextCode);
                setFormName("");
                setFormCategory(allCategories[0] || "");
                setFormProductSupplier(suppliers[0]?.id || "");
                setFormImage("/product-food.svg");
                setFormImages(["/product-food.svg"]);
                setFormDimensions("");
                setFormWeight(0);
                setFormDescription("");
                setFormTags("");
                setFormVariants(
                  syncVariantSkus(nextCode, [
                    {
                      id: `v_${Date.now()}_1`,
                      sku: "",
                      label: "Túi 1.5kg",
                      wholesalePrice: 150000,
                      minOrderQty: 10,
                      stock: 100,
                      supplierId: suppliers[0]?.id || "sup_pettravel"
                    },
                    {
                      id: `v_${Date.now()}_2`,
                      sku: "",
                      label: "Túi 5kg",
                      wholesalePrice: 420000,
                      minOrderQty: 5,
                      stock: 50,
                      supplierId: suppliers[0]?.id || "sup_pettravel"
                    }
                  ])
                );
                setShowProductForm(true);
              }}
            >
              + Thêm sản phẩm sỉ
            </button>
          </div>

          <div className="bg-[#171b30] p-4 rounded-2xl border border-[#272e4e] overflow-x-auto w-full">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                  <th className="py-2.5 px-2">Mã / Ảnh</th>
                  <th className="py-2.5 px-2">Tên sản phẩm sỉ</th>
                  <th className="py-2.5 px-2">Phân loại</th>
                  <th className="py-2.5 px-2">Quy cách & Giá sỉ / Kho</th>
                  <th className="py-2.5 px-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232a48]">
                {allProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted text-xs text-center py-8 font-semibold">
                      Chưa có sản phẩm nào được tạo.
                    </td>
                  </tr>
                ) : (
                  allProducts.map((p) => (
                    <tr key={p.id}>
                      <td className="w-16">
                        <div className="relative w-12 h-12 rounded-xl overflow-hidden border bg-orange-50 flex items-center justify-center p-1 shrink-0">
                          <Image src={p.imageUrl} alt={p.name} fill sizes="48px" className="object-contain p-1" />
                        </div>
                        <span className="text-[10px] font-mono font-bold text-orange-950 block mt-1 text-center">{p.code}</span>
                      </td>
                      <td>
                        <strong className="text-sm font-bold text-[#331B08]">{p.name}</strong>
                        <span className="block text-[10px] bg-orange-100 text-orange-800 rounded-full px-2 py-0.5 w-max font-bold mt-1">
                          {p.category}
                        </span>
                      </td>
                      <td className="text-xs font-semibold text-[#78350F]">{p.variants.length} phân loại</td>
                      <td>
                        <div className="flex flex-col gap-1.5">
                          {p.variants.map((v) => (
                            <div
                              key={v.id}
                              className="text-xs bg-[#FFFDF9] border border-orange-100 rounded-xl p-1.5 flex justify-between gap-4"
                            >
                              <span>
                                <strong>{v.label}</strong> ({v.sku})
                              </span>
                              <span className="muted font-bold text-orange-600">
                                {formatVnd(v.wholesalePrice ?? 0)}{" "}
                                <span className="text-[10px] text-gray-500">
                                  (Sỉ từ: {v.minOrderQty} · Kho: {v.stock})
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            className="tab-button text-xs py-1 px-3 border-orange-200 bg-orange-50/50 hover:bg-orange-100 cursor-pointer"
                            onClick={() => {
                              setEditingProduct(p);
                              setFormCode(p.code);
                              setFormName(p.name);
                              setFormCategory(p.category);
                              setFormProductSupplier(p.variants[0]?.supplierId || "");
                              setFormImage(p.imageUrl);
                              setFormImages(p.images ?? [p.imageUrl]);
                              setFormDimensions(p.dimensions ?? "");
                              setFormWeight(p.weight ?? 0);
                              setFormDescription(p.description ?? "");
                              setFormTags(p.tags.join(", "));
                              setFormVariants(syncVariantSkus(p.code, p.variants.map((v) => ({ ...v }))));
                              setShowProductForm(true);
                            }}
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            className="tab-button text-xs py-1 px-3 text-red-600 border-red-200 bg-red-50/30 hover:bg-red-50 cursor-pointer"
                            onClick={async () => {
                              if (confirm(`Bạn có chắc chắn muốn xóa sản phẩm ${p.name}?`)) {
                                const res = await fetch(`/api/products?id=${p.id}`, { method: "DELETE" });
                                if (res.ok) {
                                  await fetchProducts();
                                } else {
                                  alert("Lỗi khi xóa sản phẩm.");
                                }
                              }
                            }}
                          >
                            Xóa
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. TAB QUẢN LÝ DANH MỤC */}
      {activeTab === "admin_categories" && (
        <div className="flex flex-col gap-6 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-[#331B08] font-['Varela_Round']">🏷️ Quản lý Danh mục Sản phẩm sỉ</h2>
              <p className="muted text-xs font-semibold">
                Quản lý danh sách các danh mục hàng sỉ (Thức ăn, Túi vận chuyển, Đồ chơi...).
              </p>
            </div>
            <button
              type="button"
              className="tab-button text-xs py-2 px-4 border-orange-200 bg-orange-50/50 hover:bg-orange-100 cursor-pointer font-bold rounded-xl"
              onClick={() => {
                setNewCategoryName("");
                setShowCategoryForm(true);
              }}
            >
              + Thêm danh mục mới
            </button>
          </div>

          <div className="panel p-4 flex flex-col gap-4 w-full">
            <h3 className="text-sm font-bold text-orange-950 border-b pb-2">Danh sách danh mục hiện có</h3>
            <div className="flex flex-col gap-2">
              {allCategories.map((cat) => (
                <div key={cat} className="flex items-center justify-between p-3 border border-orange-100 bg-[#FFFDF9] rounded-xl">
                  {editingCategoryOld === cat ? (
                    <div className="flex items-center gap-2 w-full mr-4">
                      <input
                        type="text"
                        className="text-input text-xs py-1 px-2 flex-grow"
                        value={editingCategoryNew}
                        onChange={(e) => setEditingCategoryNew(e.target.value)}
                      />
                      <button
                        type="button"
                        className="tab-button bg-green-500 text-white border-green-600 px-3 py-1 text-xs cursor-pointer rounded-xl font-bold"
                        onClick={() => handleEditCategory(cat, editingCategoryNew)}
                      >
                        Lưu
                      </button>
                      <button
                        type="button"
                        className="tab-button bg-gray-200 text-gray-800 px-3 py-1 text-xs cursor-pointer rounded-xl font-bold border-gray-300"
                        onClick={() => setEditingCategoryOld(null)}
                      >
                        Hủy
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="font-bold text-sm text-orange-950">{cat}</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="tab-button px-2.5 py-1 text-xs cursor-pointer border-orange-200 text-orange-800 font-bold"
                          onClick={() => {
                            setEditingCategoryOld(cat);
                            setEditingCategoryNew(cat);
                          }}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="tab-button px-2.5 py-1 text-xs cursor-pointer bg-red-50 border-red-200 text-red-700 hover:bg-red-100 font-bold animate-pulse-none"
                          onClick={() => handleDeleteCategory(cat)}
                        >
                          Xóa
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {allCategories.length === 0 && <p className="muted text-xs text-center py-4">Chưa có danh mục nào.</p>}
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB QUẢN LÝ NHÀ CUNG CẤP */}
      {activeTab === "admin_suppliers" && (
        <div className="flex flex-col gap-6 w-full">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#331B08] font-['Varela_Round']">🏢 Quản lý Đối tác Nhà cung cấp sỉ</h2>
              <p className="muted text-xs font-semibold">
                Quản lý các nhà cung cấp sỉ, thời gian chuẩn bị hàng (lead time) và cài đặt hiển thị.
              </p>
            </div>
            <button
              type="button"
              className="primary-button text-xs py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl cursor-pointer"
              onClick={() => {
                setEditingSupplier(null);
                setSupCode("");
                setSupName("");
                setSupLeadTime(3);
                setSupAdminOnly(true);
                setShowSupplierForm(true);
              }}
            >
              + Thêm nhà cung cấp
            </button>
          </div>

          <div className="panel p-4 overflow-x-auto w-full">
            <table className="variant-table w-full">
              <thead>
                <tr>
                  <th>Mã NCC</th>
                  <th>Tên nhà cung cấp sỉ</th>
                  <th>Lead-time chuẩn bị</th>
                  <th>Hiển thị sỉ</th>
                  <th className="text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="font-mono font-bold text-orange-900 text-xs">{s.code}</td>
                    <td>
                      <strong className="text-orange-950 text-sm">{s.name}</strong>
                    </td>
                    <td className="text-xs font-bold">{s.leadTimeDays} ngày</td>
                    <td>
                      <span
                        className={`tag text-[10px] px-2 py-0.5 rounded-full font-bold ${
                          s.adminOnly ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
                        }`}
                      >
                        {s.adminOnly ? "Chỉ Admin thấy" : "Công khai với Khách"}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="tab-button px-2.5 py-1 text-xs cursor-pointer border-orange-200 text-orange-800 font-bold"
                          onClick={() => {
                            setEditingSupplier(s);
                            setSupCode(s.code);
                            setSupName(s.name);
                            setSupLeadTime(s.leadTimeDays);
                            setSupAdminOnly(s.adminOnly);
                            setShowSupplierForm(true);
                          }}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="tab-button px-2.5 py-1 text-xs cursor-pointer bg-red-50 border-red-200 text-red-700 hover:bg-red-100 font-bold"
                          onClick={() => handleDeleteSupplier(s.id, s.name)}
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {suppliers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted text-xs text-center py-6">
                      Chưa có nhà cung cấp nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. TAB KHO & MUA HÀNG OPERATIONS */}
      {activeTab === "admin_operations" && (
        <div className="flex flex-col gap-6 w-full">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <PackageCheck size={22} className="text-orange-600" />
                <h2 className="text-xl font-bold text-[#331B08] font-['Varela_Round']">Kho & Mua hàng</h2>
              </div>
              <p className="muted text-xs font-semibold">
                Quản lý nghiệp vụ nhập hàng, tồn kho, hàng lỗi, hóa đơn bán hàng và chi phí phát sinh trước khi ghi sổ kế toán.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="tab-button text-xs py-2 px-4 border-orange-200 bg-orange-50/50 hover:bg-orange-100 cursor-pointer font-bold rounded-xl flex items-center gap-1.5"
                onClick={() => {
                  setOperationPartner("");
                  setOperationSku("");
                  setOperationDescription("");
                  setOperationQuantity(1);
                  setOperationUnitCost(0);
                  setOperationExpenseCategory("Chi phí phát sinh");
                  setOperationExpenseAmount(0);
                  setOperationPostNow(false);
                  setShowOperationsForm(true);
                }}
              >
                + Lập chứng từ mới
              </button>
              <button
                type="button"
                className="tab-button text-xs py-2 px-4 border-orange-200 bg-white hover:bg-orange-50 cursor-pointer font-bold rounded-xl flex items-center gap-1.5"
                onClick={fetchOperationsOverview}
                disabled={isOperationsLoading}
              >
                <RefreshCw size={14} className={isOperationsLoading ? "animate-spin" : ""} />
                {isOperationsLoading ? "Đang tải..." : "Làm mới kho"}
              </button>
            </div>
          </div>

          {(overviewError || operationsError) && (
            <div className="p-4 border border-red-200 bg-red-50 rounded-2xl flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-sm text-red-950 block">Không xử lý được nghiệp vụ vận hành</strong>
                <p className="text-xs text-red-800 m-0 mt-1">{operationsError || overviewError}</p>
              </div>
            </div>
          )}

          <div className="metrics-grid">
            <div className="metric">
              <span className="muted text-sm flex items-center gap-1 font-semibold">
                <Boxes size={14} className="text-orange-600" /> Tồn thực tế
              </span>
              <strong>{operationsOverview ? operationsOverview.inventory.onHandQty.toLocaleString("vi-VN") : "—"}</strong>
              <span className="text-[10px] muted">
                Khả dụng: {operationsOverview?.inventory.availableQty.toLocaleString("vi-VN") ?? 0}
              </span>
            </div>
            <div className="metric">
              <span className="muted text-sm flex items-center gap-1 font-semibold">
                <AlertTriangle size={14} className="text-red-600" /> Hàng lỗi
              </span>
              <strong className="text-red-700">
                {operationsOverview ? operationsOverview.inventory.defectiveQty.toLocaleString("vi-VN") : "—"}
              </strong>
              <span className="text-[10px] muted">{operationsOverview?.defectiveSkuCount ?? 0} SKU đang có lỗi/hư hỏng.</span>
            </div>
            <div className="metric">
              <span className="muted text-sm flex items-center gap-1 font-semibold">
                <WalletCards size={14} className="text-green-600" /> Giá trị tồn
              </span>
              <strong className="text-green-700">{formatVnd(operationsOverview?.inventory.inventoryValueVnd ?? 0)}</strong>
              <span className="text-[10px] muted">Tính theo giá vốn bình quân hiện có.</span>
            </div>
            <div className="metric">
              <span className="muted text-sm flex items-center gap-1 font-semibold">
                <RefreshCw size={14} className="text-amber-600" /> Chờ xử lý
              </span>
              <strong className="text-amber-700">
                {operationsOverview
                  ? operationsOverview.openPurchaseReceipts + operationsOverview.pendingInvoices + operationsOverview.pendingExpenses
                  : 0}
              </strong>
              <span className="text-[10px] muted">Phiếu nhập, hóa đơn, chi phí còn nháp/chờ duyệt.</span>
            </div>
          </div>

          <div className="panel p-4 flex flex-col gap-4 overflow-x-auto w-full">
            <div className="flex items-center justify-between border-b border-dashed border-orange-100 pb-2">
              <h3 className="text-sm font-bold text-[#331B08]">Chứng từ vận hành gần nhất</h3>
              <StatusPill tone={operationsOverview?.recentDocuments.length ? "info" : "warning"}>
                {operationsOverview?.recentDocuments.length
                  ? `${operationsOverview.recentDocuments.length} chứng từ`
                  : "Chưa có dữ liệu"}
              </StatusPill>
            </div>

            <table className="variant-table w-full">
              <thead>
                <tr>
                  <th>Số chứng từ</th>
                  <th>Nghiệp vụ</th>
                  <th>Đối tác</th>
                  <th className="text-right">Giá trị</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {operationsOverview?.recentDocuments && operationsOverview.recentDocuments.length > 0 ? (
                  operationsOverview.recentDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td className="text-xs font-mono font-bold text-orange-950">{doc.documentNo}</td>
                      <td className="text-xs text-[#331B08] font-bold">{operationsTypeLabel(doc.type)}</td>
                      <td className="text-xs text-gray-600">{doc.partnerName || "Pet Travel nội bộ"}</td>
                      <td className="text-right text-xs font-bold text-[#331B08]">{formatVnd(doc.totalAmountVnd)}</td>
                      <td>
                        <span
                          className={`status-pill text-[10px] ${
                            doc.status === "posted" ? "success" : doc.status === "draft" ? "warning" : "info"
                          }`}
                        >
                          {doc.status === "posted" ? "Đã post" : doc.status === "draft" ? "Nháp" : doc.status === "void" ? "Đã hủy" : "Chờ duyệt"}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-gray-500 font-medium">
                      Chưa có chứng từ. Hãy tạo phiếu nhập hoặc chi phí đầu tiên sau khi chạy migration Supabase v4.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- POPUP FORMS RUN LOCALLY --- */}

      {/* Product Form Modal */}
      {showProductForm && (
        <div
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
          onClick={() => setShowProductForm(false)}
        >
          <div
            className="panel max-w-4xl w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <h3 className="text-lg font-bold text-orange-950 m-0 font-['Varela_Round']">
                {editingProduct ? `Cập nhật sản phẩm: ${editingProduct.name}` : "Thêm sản phẩm sỉ mới"}
              </h3>
              <button
                type="button"
                className="w-8 h-8 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center text-xs font-bold hover:bg-orange-100 transition cursor-pointer"
                onClick={() => setShowProductForm(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="flex flex-col gap-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Mã sản phẩm (Product Code):</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3 uppercase"
                    placeholder="Ví dụ: FOOD-01, SHAM-02..."
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Tên sản phẩm sỉ:</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3"
                    placeholder="Nhập tên sản phẩm sỉ đầy đủ..."
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Danh mục sỉ:</label>
                  <select
                    className="text-input text-xs py-2 px-3 bg-white border border-orange-200"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  >
                    {allCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Nhà cung cấp chính:</label>
                  <select
                    className="text-input text-xs py-2 px-3 bg-white border border-orange-200"
                    value={formProductSupplier}
                    onChange={(e) => setFormProductSupplier(e.target.value)}
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Kích thước đóng gói:</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3"
                    placeholder="Ví dụ: 30x20x15 cm..."
                    value={formDimensions}
                    onChange={(e) => setFormDimensions(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Trọng lượng (gram):</label>
                  <input
                    type="number"
                    className="text-input text-xs py-2 px-3"
                    value={formWeight}
                    onChange={(e) => setFormWeight(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Thẻ tags (phân cách bằng dấu phẩy):</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3"
                    placeholder="cat, food, premium..."
                    value={formTags}
                    onChange={(e) => setFormTags(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">
                  Quản lý Bộ sưu tập Ảnh sản phẩm (Cloudflare R2):
                </label>
                <ImageUploader
                  initialImages={formImages}
                  initialMainImage={formImage}
                  productId={editingProduct?.id || formCode}
                  onChange={(images, mainImage) => {
                    setFormImages(images);
                    setFormImage(mainImage);
                  }}
                />
              </div>

              {/* Form variants list */}
              <div className="border border-orange-100 bg-orange-50/20 p-4 rounded-2xl flex flex-col gap-3">
                <h4 className="m-0 text-xs font-bold text-[#78350F] border-b border-dashed border-orange-100 pb-1.5">
                  🎨 Quản lý Phân loại hàng sỉ & Ảnh riêng từng mẫu (Variants)
                </h4>
                <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {formVariants.map((v, idx) => (
                    <div key={v.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white p-2.5 rounded-xl border border-orange-100">
                      <div className="sm:col-span-1 flex flex-col items-center justify-center">
                        <VariantImageUploader
                          currentUrl={v.imageUrl}
                          productId={editingProduct?.id || formCode}
                          variantId={v.sku || v.id}
                          onChange={(url) => {
                            const copy = [...formVariants];
                            copy[idx].imageUrl = url;
                            setFormVariants(copy);
                          }}
                        />
                      </div>
                      <div className="sm:col-span-3 flex flex-col gap-0.5">
                        <label className="text-[9px] font-semibold text-gray-500 uppercase">Tên phân loại sỉ</label>
                        <input
                          type="text"
                          className="text-input text-[11px] py-1 px-2"
                          value={v.label}
                          onChange={(e) => {
                            const copy = [...formVariants];
                            copy[idx].label = e.target.value;
                            setFormVariants(syncVariantSkus(formCode, copy));
                          }}
                          required
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-col gap-0.5">
                        <label className="text-[9px] font-semibold text-gray-500 uppercase">Mã SKU (Tự động)</label>
                        <input
                          type="text"
                          className="text-input text-[11px] py-1 px-2 font-mono bg-gray-50 text-[10px]"
                          value={v.sku}
                          disabled
                        />
                      </div>
                      <div className="sm:col-span-2 flex flex-col gap-0.5">
                        <label className="text-[9px] font-semibold text-gray-500 uppercase">Giá sỉ (đ)</label>
                        <input
                          type="number"
                          className="text-input text-[11px] py-1 px-2"
                          value={v.wholesalePrice}
                          onChange={(e) => {
                            const copy = [...formVariants];
                            copy[idx].wholesalePrice = Number(e.target.value) || 0;
                            setFormVariants(copy);
                          }}
                          required
                        />
                      </div>
                      <div className="sm:col-span-1.5 flex flex-col gap-0.5">
                        <label className="text-[9px] font-semibold text-gray-500 uppercase">Sỉ tối thiểu</label>
                        <input
                          type="number"
                          className="text-input text-[11px] py-1 px-2"
                          value={v.minOrderQty}
                          onChange={(e) => {
                            const copy = [...formVariants];
                            copy[idx].minOrderQty = Number(e.target.value) || 1;
                            setFormVariants(copy);
                          }}
                          required
                        />
                      </div>
                      <div className="sm:col-span-1.5 flex flex-col gap-0.5">
                        <label className="text-[9px] font-semibold text-gray-500 uppercase">Tồn kho</label>
                        <input
                          type="number"
                          className="text-input text-[11px] py-1 px-2"
                          value={v.stock}
                          onChange={(e) => {
                            const copy = [...formVariants];
                            copy[idx].stock = Number(e.target.value) || 0;
                            setFormVariants(copy);
                          }}
                          required
                        />
                      </div>
                      <div className="sm:col-span-1 flex justify-center pt-1">
                        <button
                          type="button"
                          className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer"
                          disabled={formVariants.length <= 1}
                          onClick={() => {
                            const copy = formVariants.filter((_, i) => i !== idx);
                            setFormVariants(syncVariantSkus(formCode, copy));
                          }}
                          title="Xóa phân loại này"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="tab-button text-[10px] py-1.5 w-max px-3 bg-white border border-orange-200 text-[#78350F] hover:bg-orange-50 font-bold rounded-xl cursor-pointer"
                  onClick={() => {
                    setFormVariants((prev) =>
                      syncVariantSkus(formCode, [
                        ...prev,
                        {
                          id: `v_${Date.now()}_${prev.length + 1}`,
                          sku: "",
                          label: "Phân loại mới",
                          wholesalePrice: 100000,
                          minOrderQty: 10,
                          stock: 10,
                          supplierId: formProductSupplier || suppliers[0]?.id || "sup_pettravel"
                        }
                      ])
                    );
                  }}
                >
                  + Thêm phân loại
                </button>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Mô tả sản phẩm sỉ:</label>
                <textarea
                  className="text-input text-xs py-2 px-3 min-h-[70px]"
                  placeholder="Nhập thông số, chất liệu, cách đóng gói..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end mt-4 border-t pt-4 border-orange-100">
                <button
                  type="button"
                  className="tab-button text-xs py-2 px-4 cursor-pointer font-bold rounded-xl"
                  onClick={() => setShowProductForm(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="primary-button text-xs py-2 px-6 font-bold bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer rounded-xl"
                >
                  Lưu sản phẩm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Add Modal */}
      {showCategoryForm && (
        <div
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
          onClick={() => setShowCategoryForm(false)}
        >
          <div
            className="panel max-w-sm w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <h3 className="text-base font-bold text-orange-950 m-0 font-['Varela_Round']">Thêm danh mục sỉ mới</h3>
              <button
                type="button"
                className="w-6 h-6 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center text-xs font-bold hover:bg-orange-100 transition cursor-pointer"
                onClick={() => setShowCategoryForm(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddCategory} className="flex flex-col gap-4 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-orange-900">Tên danh mục:</label>
                <input
                  type="text"
                  className="text-input text-xs py-2 px-3"
                  placeholder="Ví dụ: Thức ăn, Phụ kiện, Cát vệ sinh..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="primary-button text-xs py-2.5 w-full font-bold bg-orange-500 text-white rounded-xl cursor-pointer"
              >
                + Thêm danh mục
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Supplier Add/Edit Modal */}
      {showSupplierForm && (
        <div
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
          onClick={() => {
            setShowSupplierForm(false);
            setEditingSupplier(null);
          }}
        >
          <div
            className="panel max-w-2xl w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <h3 className="text-base font-bold text-orange-950 m-0 font-['Varela_Round']">
                {editingSupplier ? `Cập nhật nhà cung cấp: ${editingSupplier.name}` : "Thêm nhà cung cấp sỉ mới"}
              </h3>
              <button
                type="button"
                className="w-6 h-6 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center text-xs font-bold hover:bg-orange-100 transition cursor-pointer"
                onClick={() => {
                  setShowSupplierForm(false);
                  setEditingSupplier(null);
                }}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSaveSupplier} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-orange-900">Mã nhà cung cấp (Code):</label>
                <input
                  type="text"
                  className="text-input text-xs py-2 px-3 uppercase"
                  placeholder="PT, PC, ML..."
                  value={supCode}
                  onChange={(e) => setSupCode(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5 sm:col-span-1 lg:col-span-2">
                <label className="text-xs font-bold text-orange-900">Tên nhà cung cấp:</label>
                <input
                  type="text"
                  className="text-input text-xs py-2 px-3"
                  placeholder="Nhập tên nhà cung cấp..."
                  value={supName}
                  onChange={(e) => setSupName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-orange-900">Chuẩn bị hàng (Lead time ngày):</label>
                <input
                  type="number"
                  className="text-input text-xs py-2 px-3"
                  value={supLeadTime}
                  onChange={(e) => setSupLeadTime(Number(e.target.value))}
                />
              </div>
              <div className="flex items-center gap-2 pb-3.5 sm:col-span-2 lg:col-span-4">
                <input
                  type="checkbox"
                  id="supAdminOnly"
                  checked={supAdminOnly}
                  onChange={(e) => setSupAdminOnly(e.target.checked)}
                />
                <label htmlFor="supAdminOnly" className="text-xs font-bold text-orange-900 cursor-pointer">
                  Chỉ hiển thị với Admin
                </label>
              </div>
              <div className="sm:col-span-2 lg:col-span-4 flex justify-end gap-2.5 mt-3 border-t pt-3 border-orange-100">
                <button
                  type="button"
                  className="tab-button text-xs py-1.5 px-3 cursor-pointer rounded-xl font-bold"
                  onClick={() => {
                    setShowSupplierForm(false);
                    setEditingSupplier(null);
                  }}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="primary-button text-xs py-1.5 px-4 font-bold bg-orange-500 text-white rounded-xl cursor-pointer"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Operations Document Form Modal */}
      {showOperationsForm && (
        <div
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/60 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
          onClick={() => setShowOperationsForm(false)}
        >
          <form
            onSubmit={handleCreateOperationsDocument}
            className="panel max-w-lg w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8 text-xs"
            onClick={(e) => e.stopPropagation()}
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-orange-950 m-0 font-['Varela_Round']">Lập chứng từ vận hành mới</h3>
                <StatusPill tone={operationPostNow ? "warning" : "info"}>
                  {operationPostNow ? "Post ngay" : "Lưu nháp"}
                </StatusPill>
              </div>
              <button
                type="button"
                className="w-6 h-6 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center text-xs font-bold hover:bg-orange-100 transition cursor-pointer"
                onClick={() => setShowOperationsForm(false)}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Loại nghiệp vụ</label>
                <select
                  className="text-input text-xs py-2 px-3 bg-white border border-orange-200"
                  value={operationType}
                  onChange={(e) => setOperationType(e.target.value as OperationsDocumentType)}
                >
                  <option value="purchase_receipt">Nhập hàng từ nhà cung cấp</option>
                  <option value="sales_invoice">Tạo hóa đơn bán hàng</option>
                  <option value="expense">Chi phí phát sinh</option>
                  <option value="defect_report">Ghi nhận hàng lỗi</option>
                  <option value="stock_adjustment">Kiểm kê / điều chỉnh tăng</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-orange-950/80 uppercase">Đối tác / Nhà cung cấp</label>
                <input
                  type="text"
                  className="text-input text-xs py-2 px-3"
                  value={operationPartner}
                  onChange={(e) => setOperationPartner(e.target.value)}
                  placeholder="Ví dụ: Pet Travel, NCC A..."
                />
              </div>
            </div>

            {operationType === "expense" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Nhóm chi phí</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3"
                    value={operationExpenseCategory}
                    onChange={(e) => setOperationExpenseCategory(e.target.value)}
                    placeholder="Vận chuyển, đóng gói, marketing..."
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Số tiền chi phí</label>
                  <input
                    type="number"
                    className="text-input text-xs py-2 px-3"
                    value={operationExpenseAmount}
                    onChange={(e) => setOperationExpenseAmount(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="flex flex-col gap-1.5 sm:col-span-1">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">SKU / Mã phân loại</label>
                  <input
                    type="text"
                    className="text-input text-xs py-2 px-3 font-mono"
                    value={operationSku}
                    onChange={(e) => setOperationSku(e.target.value)}
                    placeholder="VD: PT-BAG-001..."
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Số lượng</label>
                  <input
                    type="number"
                    className="text-input text-xs py-2 px-3"
                    value={operationQuantity}
                    onChange={(e) => setOperationQuantity(parseInt(e.target.value, 10) || 1)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase">Đơn giá vốn</label>
                  <input
                    type="number"
                    className="text-input text-xs py-2 px-3"
                    value={operationUnitCost}
                    onChange={(e) => setOperationUnitCost(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-orange-950/80 uppercase">Mô tả / Ghi chú</label>
              <textarea
                className="text-input text-xs py-2 px-3 min-h-[50px]"
                value={operationDescription}
                onChange={(e) => setOperationDescription(e.target.value)}
                placeholder="Nhập mô tả thêm..."
              />
            </div>

            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="postNow"
                checked={operationPostNow}
                onChange={(e) => setOperationPostNow(e.target.checked)}
              />
              <label htmlFor="postNow" className="text-xs font-bold text-orange-900 cursor-pointer">
                Ghi sổ (Post) chứng từ ngay lập tức (Không lưu nháp)
              </label>
            </div>

            <div className="flex gap-2 justify-end mt-4 border-t pt-4 border-orange-100">
              <button
                type="button"
                className="tab-button text-xs py-2 px-4 cursor-pointer font-bold rounded-xl"
                onClick={() => setShowOperationsForm(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="primary-button text-xs py-2 px-6 font-bold bg-orange-500 text-white border-orange-600 hover:bg-orange-600 cursor-pointer rounded-xl"
              >
                Lập chứng từ
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
