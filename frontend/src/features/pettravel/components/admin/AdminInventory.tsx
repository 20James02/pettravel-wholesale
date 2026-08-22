import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  AlertTriangle,
  Boxes,
  PackageCheck,
  RefreshCw,
  WalletCards,
  Check,
  CheckSquare,
  Square,
  Trash2,
  Ban,
  Edit2
} from "lucide-react";
import type { Product, Supplier, OperationsOverview, ProductVariant, OperationsDocumentType } from "@/lib/domain";
import { formatVnd } from "@/lib/money";
import { StatusPill } from "../ui/StatusPill";
import { productSchema, supplierSchema } from "@/lib/validation";
import { getValidationErrorMessage } from "@/lib/validation";
import { ImageUploader } from "../product/ImageUploader";
import { VariantImageUploader } from "../product/VariantImageUploader";

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
  // --- MODAL REFS FOR ACTIVE SCROLL ---
  const productModalRef = useRef<HTMLDivElement>(null);
  const categoryModalRef = useRef<HTMLDivElement>(null);
  const supplierModalRef = useRef<HTMLDivElement>(null);
  const operationsModalRef = useRef<HTMLDivElement>(null);

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
  const [productFormErrors, setProductFormErrors] = useState<Record<string, string>>({});

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

  // --- BODY SCROLL LOCK & ACTIVE SCROLL TO TOP WHEN POPUP OPENS ---
  useEffect(() => {
    const isAnyModalOpen = showProductForm || showCategoryForm || showSupplierForm || showOperationsForm;
    if (isAnyModalOpen) {
      const origOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = origOverflow;
      };
    }
  }, [showProductForm, showCategoryForm, showSupplierForm, showOperationsForm]);

  useEffect(() => {
    if (showProductForm && productModalRef.current) {
      productModalRef.current.scrollTop = 0;
    }
  }, [showProductForm]);

  useEffect(() => {
    if (showCategoryForm && categoryModalRef.current) {
      categoryModalRef.current.scrollTop = 0;
    }
  }, [showCategoryForm]);

  useEffect(() => {
    if (showSupplierForm && supplierModalRef.current) {
      supplierModalRef.current.scrollTop = 0;
    }
  }, [showSupplierForm]);

  useEffect(() => {
    if (showOperationsForm && operationsModalRef.current) {
      operationsModalRef.current.scrollTop = 0;
    }
  }, [showOperationsForm]);

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

  // --- BULK SELECTION & INLINE STOCK EDITING STATES ---
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [tempVariantStock, setTempVariantStock] = useState<Record<string, number>>({});
  const [isSavingStock, setIsSavingStock] = useState<Record<string, boolean>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleSaveVariantStock = async (product: Product, variantId: string) => {
    const newStock = tempVariantStock[variantId];
    if (newStock === undefined || newStock < 0) return;

    setIsSavingStock((prev) => ({ ...prev, [variantId]: true }));
    try {
      const updatedVariants = product.variants.map((v) =>
        v.id === variantId ? { ...v, stock: newStock } : v
      );
      const res = await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...product, variants: updatedVariants })
      });
      if (res.ok) {
        await fetchProducts();
        setTempVariantStock((prev) => {
          const next = { ...prev };
          delete next[variantId];
          return next;
        });
        showToast("Đã lưu tồn kho thành công!");
      } else {
        alert("Lỗi khi lưu tồn kho.");
      }
    } catch {
      alert("Lỗi kết nối máy chủ.");
    } finally {
      setIsSavingStock((prev) => ({ ...prev, [variantId]: false }));
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedProductIds.size === allProducts.length) {
      setSelectedProductIds(new Set());
    } else {
      setSelectedProductIds(new Set(allProducts.map((p) => p.id)));
    }
  };

  const handleToggleSelectProduct = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkOutOfStock = async () => {
    if (selectedProductIds.size === 0) return;
    if (!confirm(`Bạn có chắc chắn muốn chuyển ${selectedProductIds.size} sản phẩm đã chọn sang trạng thái "Tạm hết hàng" (tồn kho = 0)?`)) return;

    for (const prodId of selectedProductIds) {
      const prod = allProducts.find((p) => p.id === prodId);
      if (!prod) continue;
      const zeroVariants = prod.variants.map((v) => ({ ...v, stock: 0 }));
      await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...prod, variants: zeroVariants })
      });
    }
    await fetchProducts();
    setSelectedProductIds(new Set());
    showToast("Đã chuyển các sản phẩm đã chọn sang Tạm hết hàng!");
  };

  const handleBulkInStock = async () => {
    if (selectedProductIds.size === 0) return;
    for (const prodId of selectedProductIds) {
      const prod = allProducts.find((p) => p.id === prodId);
      if (!prod) continue;
      const refilledVariants = prod.variants.map((v) => ({ ...v, stock: v.stock > 0 ? v.stock : 50 }));
      await fetch("/api/products", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...prod, variants: refilledVariants })
      });
    }
    await fetchProducts();
    setSelectedProductIds(new Set());
    showToast("Đã bổ sung tồn kho cho các sản phẩm đã chọn!");
  };

  const handleBulkDelete = async () => {
    if (selectedProductIds.size === 0) return;
    if (!confirm(`CẢNH BÁO: Bạn có chắc chắn muốn xóa vĩnh viễn ${selectedProductIds.size} sản phẩm đã chọn?`)) return;

    for (const prodId of selectedProductIds) {
      await fetch(`/api/products?id=${prodId}`, { method: "DELETE" });
    }
    await fetchProducts();
    setSelectedProductIds(new Set());
    showToast("Đã xóa các sản phẩm đã chọn!");
  };

  // --- INLINE VALIDATION FOR PRODUCT FORM ---
  const validateProductInputs = (
    code: string,
    name: string,
    category: string,
    weightVal: number,
    variants: ProductVariant[]
  ): Record<string, string> => {
    const errs: Record<string, string> = {};
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode) {
      errs.code = "Vui lòng nhập mã sản phẩm.";
    } else if (cleanCode.length < 2) {
      errs.code = "Mã sản phẩm phải có ít nhất 2 ký tự.";
    } else if (!/^[A-Z0-9][A-Z0-9_-]{1,39}$/i.test(cleanCode)) {
      errs.code = "Mã sản phẩm chỉ gồm chữ, số, gạch ngang (-) hoặc gạch dưới (_).";
    } else if (!editingProduct && allProducts.some((p) => p.code.toUpperCase() === cleanCode)) {
      errs.code = `Mã sản phẩm "${cleanCode}" đã tồn tại trong kho hàng.`;
    } else if (editingProduct && allProducts.some((p) => p.id !== editingProduct.id && p.code.toUpperCase() === cleanCode)) {
      errs.code = `Mã sản phẩm "${cleanCode}" đã trùng với một sản phẩm khác.`;
    }

    if (!name.trim()) {
      errs.name = "Vui lòng nhập tên sản phẩm sỉ.";
    } else if (name.trim().length < 2) {
      errs.name = "Tên sản phẩm phải có ít nhất 2 ký tự.";
    } else if (name.trim().length > 180) {
      errs.name = "Tên sản phẩm tối đa 180 ký tự.";
    }

    if (!category || !category.trim()) {
      errs.category = "Vui lòng chọn danh mục cho sản phẩm.";
    }

    if (isNaN(weightVal) || weightVal < 0) {
      errs.weight = "Trọng lượng phải là số không âm (≥ 0).";
    }

    if (!variants || variants.length === 0) {
      errs.variants = "Sản phẩm phải có ít nhất 1 phân loại hàng sỉ.";
    } else {
      variants.forEach((v, idx) => {
        if (!v.label || !v.label.trim()) {
          errs[`variant_${idx}_label`] = "Vui lòng nhập tên phân loại.";
        }
        const wp = Number(v.wholesalePrice ?? 0);
        if (isNaN(wp) || wp < 1000) {
          errs[`variant_${idx}_wholesalePrice`] = "Giá sỉ phải từ 1.000đ trở lên.";
        }
        const moq = Number(v.minOrderQty ?? 0);
        if (isNaN(moq) || moq < 1) {
          errs[`variant_${idx}_minOrderQty`] = "Số lượng sỉ tối thiểu phải từ 1 trở lên.";
        }
        const st = Number(v.stock ?? 0);
        if (isNaN(st) || st < 0) {
          errs[`variant_${idx}_stock`] = "Tồn kho không được âm.";
        }
      });
    }

    return errs;
  };

  // --- LOGIC HANDLERS ---
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors = validateProductInputs(formCode, formName, formCategory, formWeight, formVariants);
    if (Object.keys(errors).length > 0) {
      setProductFormErrors(errors);
      showToast("Vui lòng kiểm tra và hoàn thiện các trường thông tin có viền đỏ!");
      return;
    }

    setProductFormErrors({});

    const productData = {
      id: editingProduct?.id || `p_${Date.now()}`,
      code: formCode.trim().toUpperCase(),
      name: formName.trim(),
      category: formCategory.trim(),
      brand: "Pet Travel",
      imageUrl: formImage || "/product-food.svg",
      images: formImages.length > 0 ? formImages : [formImage || "/product-food.svg"],
      dimensions: formDimensions.trim(),
      weight: Number(formWeight) || 0,
      description: formDescription.trim(),
      tags: formTags.split(",").map((t) => t.trim()).filter(Boolean),
      variants: formVariants.map((v) => ({
        ...v,
        label: v.label.trim(),
        wholesalePrice: Number(v.wholesalePrice) || 0,
        minOrderQty: Number(v.minOrderQty) || 1,
        stock: Number(v.stock) || 0,
        supplierId: formProductSupplier || v.supplierId || suppliers[0]?.id || "sup_pettravel"
      }))
    };

    const preflight = productSchema.safeParse(productData);
    if (!preflight.success) {
      const msg = getValidationErrorMessage(preflight.error, "Dữ liệu sản phẩm không hợp lệ.");
      showToast(`⚠️ ${msg}`);
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
        showToast(editingProduct ? "Đã cập nhật sản phẩm thành công!" : "Đã thêm sản phẩm mới thành công!");
      } else {
        const errData = await res.json();
        showToast(`⚠️ ${errData.error || "Lỗi khi lưu sản phẩm."}`);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error("Không thể thực hiện yêu cầu.");
      showToast(`⚠️ Lỗi kết nối: ${err.message || "Không thể thực hiện yêu cầu."}`);
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
                setProductFormErrors({});
                setShowProductForm(true);
              }}
            >
              + Thêm sản phẩm sỉ
            </button>
          </div>

          {/* Toast Notification */}
          {toastMsg && (
            <div className="fixed bottom-5 right-5 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-xl font-bold text-xs flex items-center gap-2 animate-fade-in">
              <Check size={16} />
              <span>{toastMsg}</span>
            </div>
          )}

          {/* Bulk Action Toolbar */}
          {selectedProductIds.size > 0 && (
            <div className="bg-[#1f2648] border border-indigo-500/40 p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 animate-fade-in shadow-lg">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center">
                  {selectedProductIds.size}
                </span>
                <span className="text-xs font-bold text-white">
                  Đã chọn {selectedProductIds.size} sản phẩm
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleBulkOutOfStock}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Ban size={14} />
                  <span>Tạm hết hàng</span>
                </button>

                <button
                  type="button"
                  onClick={handleBulkInStock}
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <PackageCheck size={14} />
                  <span>Còn hàng (+50)</span>
                </button>

                <button
                  type="button"
                  onClick={handleBulkDelete}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Trash2 size={14} />
                  <span>Xóa đã chọn</span>
                </button>
              </div>
            </div>
          )}

          <div className="bg-[#171b30] p-4 rounded-2xl border border-[#272e4e] overflow-x-auto w-full">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#293154] text-[10px] text-gray-400 uppercase font-bold">
                  <th className="py-2.5 px-2 w-10 text-center">
                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="cursor-pointer text-gray-400 hover:text-white flex items-center justify-center"
                    >
                      {selectedProductIds.size === allProducts.length && allProducts.length > 0 ? (
                        <CheckSquare size={16} className="text-indigo-400" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="py-2.5 px-2 w-20">Mã</th>
                  <th className="py-2.5 px-2 w-20">Ảnh chính</th>
                  <th className="py-2.5 px-2">Tên sản phẩm sỉ & Danh mục</th>
                  <th className="py-2.5 px-2">Phân loại (Ảnh · Giá · Tồn kho)</th>
                  <th className="py-2.5 px-2 text-right w-24">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232a48]">
                {allProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="muted text-xs text-center py-8 font-semibold">
                      Chưa có sản phẩm nào được tạo.
                    </td>
                  </tr>
                ) : (
                  allProducts.map((p) => {
                    const isSelected = selectedProductIds.has(p.id);
                    const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);

                    return (
                      <tr key={p.id} className={`hover:bg-[#1d2340]/60 transition ${isSelected ? "bg-[#22294e]/50" : ""}`}>
                        {/* 1. Checkbox */}
                        <td className="py-3 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSelectProduct(p.id)}
                            className="cursor-pointer text-gray-400 hover:text-white flex items-center justify-center mx-auto"
                          >
                            {isSelected ? (
                              <CheckSquare size={16} className="text-indigo-400" />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </td>

                        {/* 2. Mã sản phẩm */}
                        <td className="py-3 px-2 font-mono font-bold text-indigo-300 text-xs">
                          {p.code}
                        </td>

                        {/* 3. Ảnh chính */}
                        <td className="py-3 px-2">
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-[#313b63] bg-[#111425] flex items-center justify-center shrink-0 group">
                            <Image src={p.imageUrl || "/product-food.svg"} alt={p.name} fill sizes="48px" className="object-contain p-1" />
                          </div>
                        </td>

                        {/* 4. Tên sản phẩm & Danh mục */}
                        <td className="py-3 px-2">
                          <strong className="text-xs font-bold text-white block leading-snug">{p.name}</strong>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full px-2 py-0.5 font-bold">
                              {p.category}
                            </span>
                            {totalStock === 0 ? (
                              <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full px-2 py-0.5 font-bold">
                                Tạm hết hàng
                              </span>
                            ) : (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full px-2 py-0.5 font-bold">
                                Còn {totalStock} sp
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 5. Phân loại & Chỉnh sửa tồn kho trực tiếp */}
                        <td className="py-3 px-2">
                          <div className="flex flex-col gap-1.5">
                            {p.variants.map((v) => {
                              const draftStock = tempVariantStock[v.id];
                              const isEdited = draftStock !== undefined && draftStock !== v.stock;
                              const isSaving = isSavingStock[v.id];

                              return (
                                <div
                                  key={v.id}
                                  className="text-xs bg-[#121528] border border-[#262e4e] rounded-xl p-2 flex flex-wrap items-center justify-between gap-3"
                                >
                                  {/* Left: Variant Image + Label & SKU */}
                                  <div className="flex items-center gap-2 min-w-0">
                                    <div className="relative w-8 h-8 rounded-lg overflow-hidden border border-[#2b3558] bg-[#1a1f38] shrink-0">
                                      <Image
                                        src={v.imageUrl || p.imageUrl || "/product-food.svg"}
                                        alt={v.label}
                                        fill
                                        sizes="32px"
                                        className="object-contain p-0.5"
                                      />
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="font-bold text-gray-200 truncate">{v.label}</span>
                                      <span className="text-[10px] text-gray-400 font-mono">{v.sku}</span>
                                    </div>
                                  </div>

                                  {/* Right: Price & Inline Stock Editor */}
                                  <div className="flex items-center gap-3">
                                    <div className="text-right">
                                      <span className="font-black text-xs font-mono text-emerald-400 block">
                                        {formatVnd(v.wholesalePrice ?? 0)}
                                      </span>
                                      <span className="text-[10px] text-gray-400">
                                        Sỉ từ: {v.minOrderQty}
                                      </span>
                                    </div>

                                    {/* Inline Stock Input with instant confirmation button */}
                                    <div className="flex items-center gap-1.5 bg-[#191e36] px-2 py-1 rounded-xl border border-[#2f3962]">
                                      <span className="text-[10px] text-gray-400 font-bold">Kho:</span>
                                      <input
                                        type="number"
                                        min="0"
                                        className="w-14 bg-[#0e1122] text-white font-mono font-bold text-xs px-1.5 py-0.5 rounded border border-[#3b4776] text-center focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                                        value={draftStock !== undefined ? draftStock : v.stock}
                                        onChange={(e) => {
                                          const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                                          setTempVariantStock((prev) => ({ ...prev, [v.id]: val }));
                                        }}
                                      />
                                      {isEdited && (
                                        <button
                                          type="button"
                                          disabled={isSaving}
                                          onClick={() => handleSaveVariantStock(p, v.id)}
                                          className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition shadow-md animate-pulse shrink-0"
                                          title="Nhấp để xác nhận cập nhật số lượng tồn kho"
                                        >
                                          {isSaving ? "..." : "✓ Lưu"}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>

                        {/* 6. Thao tác */}
                        <td className="py-3 px-2 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
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
                                setProductFormErrors({});
                                setShowProductForm(true);
                              }}
                            >
                              <Edit2 size={12} />
                              <span>Sửa</span>
                            </button>
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer transition"
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
                              <Trash2 size={12} />
                              <span>Xóa</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
              <h2 className="text-xl font-bold text-[#331B08] font-heading">🏷️ Quản lý Danh mục Sản phẩm sỉ</h2>
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
              <h2 className="text-xl font-bold text-[#331B08] font-heading">🏢 Quản lý Đối tác Nhà cung cấp sỉ</h2>
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
                <h2 className="text-xl font-bold text-[#331B08] font-heading">Kho & Mua hàng</h2>
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
          ref={productModalRef}
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/70 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
        >
          <div
            className="panel max-w-4xl w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8 max-h-[90vh] overflow-y-auto"
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <h3 className="text-lg font-bold text-orange-950 m-0 font-heading">
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
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase flex items-center justify-between">
                    <span>Mã sản phẩm (Product Code):</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`text-input text-xs py-2 px-3 uppercase ${
                      productFormErrors.code ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-1 focus:ring-red-500" : ""
                    }`}
                    placeholder="Ví dụ: FOOD-01, SHAM-02..."
                    value={formCode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormCode(val);
                      if (productFormErrors.code) {
                        const next = { ...productFormErrors };
                        delete next.code;
                        setProductFormErrors(next);
                      }
                    }}
                    onBlur={() => {
                      const errs = validateProductInputs(formCode, formName, formCategory, formWeight, formVariants);
                      if (errs.code) setProductFormErrors((prev) => ({ ...prev, code: errs.code }));
                    }}
                    required
                  />
                  {productFormErrors.code && (
                    <span className="text-[10px] text-red-600 font-semibold flex items-center gap-1 mt-0.5 animate-fade-in">
                      ⚠️ {productFormErrors.code}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase flex items-center justify-between">
                    <span>Tên sản phẩm sỉ:</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className={`text-input text-xs py-2 px-3 ${
                      productFormErrors.name ? "border-red-400 bg-red-50/20 focus:border-red-500 focus:ring-1 focus:ring-red-500" : ""
                    }`}
                    placeholder="Nhập tên sản phẩm sỉ đầy đủ..."
                    value={formName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormName(val);
                      if (productFormErrors.name) {
                        const next = { ...productFormErrors };
                        delete next.name;
                        setProductFormErrors(next);
                      }
                    }}
                    onBlur={() => {
                      const errs = validateProductInputs(formCode, formName, formCategory, formWeight, formVariants);
                      if (errs.name) setProductFormErrors((prev) => ({ ...prev, name: errs.name }));
                    }}
                    required
                  />
                  {productFormErrors.name && (
                    <span className="text-[10px] text-red-600 font-semibold flex items-center gap-1 mt-0.5 animate-fade-in">
                      ⚠️ {productFormErrors.name}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold text-orange-950/80 uppercase flex items-center justify-between">
                    <span>Danh mục sỉ:</span>
                    <span className="text-red-500">*</span>
                  </label>
                  <select
                    className={`text-input text-xs py-2 px-3 bg-white border ${
                      productFormErrors.category ? "border-red-400 bg-red-50/20 focus:border-red-500" : "border-orange-200"
                    }`}
                    value={formCategory}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormCategory(val);
                      if (productFormErrors.category) {
                        const next = { ...productFormErrors };
                        delete next.category;
                        setProductFormErrors(next);
                      }
                    }}
                  >
                    <option value="">-- Chọn danh mục sỉ --</option>
                    {allCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {productFormErrors.category && (
                    <span className="text-[10px] text-red-600 font-semibold flex items-center gap-1 mt-0.5 animate-fade-in">
                      ⚠️ {productFormErrors.category}
                    </span>
                  )}
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
                    type="text"
                    inputMode="numeric"
                    className={`text-input text-xs py-2 px-3 ${
                      productFormErrors.weight ? "border-red-400 bg-red-50/20 focus:border-red-500" : ""
                    }`}
                    placeholder="0"
                    value={formWeight === 0 ? "" : formWeight}
                    onChange={(e) => {
                      const sanitized = e.target.value.replace(/[^0-9]/g, "");
                      setFormWeight(sanitized === "" ? 0 : Number(sanitized));
                      if (productFormErrors.weight) {
                        const next = { ...productFormErrors };
                        delete next.weight;
                        setProductFormErrors(next);
                      }
                    }}
                  />
                  {productFormErrors.weight && (
                    <span className="text-[10px] text-red-600 font-semibold flex items-center gap-1 mt-0.5 animate-fade-in">
                      ⚠️ {productFormErrors.weight}
                    </span>
                  )}
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
                <div className="flex justify-between items-center border-b border-dashed border-orange-100 pb-1.5">
                  <h4 className="m-0 text-xs font-bold text-[#78350F]">
                    🎨 Quản lý Phân loại hàng sỉ & Ảnh riêng từng mẫu (Variants)
                  </h4>
                  {productFormErrors.variants && (
                    <span className="text-[10px] text-red-600 font-semibold animate-fade-in">
                      ⚠️ {productFormErrors.variants}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {formVariants.map((v, idx) => (
                    <div
                      key={v.id}
                      className={`grid grid-cols-1 sm:grid-cols-12 gap-2 items-start bg-white p-2.5 rounded-xl border transition-all ${
                        productFormErrors[`variant_${idx}_label`] ||
                        productFormErrors[`variant_${idx}_wholesalePrice`] ||
                        productFormErrors[`variant_${idx}_minOrderQty`] ||
                        productFormErrors[`variant_${idx}_stock`]
                          ? "border-red-300 bg-red-50/10 shadow-xs"
                          : "border-orange-100"
                      }`}
                    >
                      <div className="sm:col-span-1 flex flex-col items-center justify-center pt-1">
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
                        <label className="text-[9px] font-semibold text-gray-500 uppercase flex justify-between">
                          <span>Tên phân loại sỉ</span>
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          className={`text-input text-[11px] py-1 px-2 ${
                            productFormErrors[`variant_${idx}_label`] ? "border-red-400 bg-red-50/20 focus:border-red-500" : ""
                          }`}
                          value={v.label}
                          placeholder="Ví dụ: Túi 1.5kg, Màu đỏ..."
                          onChange={(e) => {
                            const copy = [...formVariants];
                            copy[idx].label = e.target.value;
                            setFormVariants(syncVariantSkus(formCode, copy));
                            if (productFormErrors[`variant_${idx}_label`]) {
                              const next = { ...productFormErrors };
                              delete next[`variant_${idx}_label`];
                              setProductFormErrors(next);
                            }
                          }}
                          required
                        />
                        {productFormErrors[`variant_${idx}_label`] && (
                          <span className="text-[9px] text-red-600 font-semibold animate-fade-in">
                            ⚠️ {productFormErrors[`variant_${idx}_label`]}
                          </span>
                        )}
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
                        <label className="text-[9px] font-semibold text-gray-500 uppercase flex justify-between">
                          <span>Giá sỉ (đ)</span>
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`text-input text-[11px] py-1 px-2 ${
                            productFormErrors[`variant_${idx}_wholesalePrice`] ? "border-red-400 bg-red-50/20 focus:border-red-500" : ""
                          }`}
                          value={v.wholesalePrice === 0 ? "" : v.wholesalePrice}
                          placeholder="150000"
                          onChange={(e) => {
                            const sanitized = e.target.value.replace(/[^0-9]/g, "");
                            const num = sanitized === "" ? 0 : Number(sanitized);
                            const copy = [...formVariants];
                            copy[idx].wholesalePrice = num;
                            setFormVariants(copy);
                            if (productFormErrors[`variant_${idx}_wholesalePrice`]) {
                              const next = { ...productFormErrors };
                              delete next[`variant_${idx}_wholesalePrice`];
                              setProductFormErrors(next);
                            }
                          }}
                          required
                        />
                        {productFormErrors[`variant_${idx}_wholesalePrice`] && (
                          <span className="text-[9px] text-red-600 font-semibold animate-fade-in">
                            ⚠️ {productFormErrors[`variant_${idx}_wholesalePrice`]}
                          </span>
                        )}
                      </div>
                      <div className="sm:col-span-1.5 flex flex-col gap-0.5">
                        <label className="text-[9px] font-semibold text-gray-500 uppercase flex justify-between">
                          <span>Sỉ tối thiểu</span>
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`text-input text-[11px] py-1 px-2 ${
                            productFormErrors[`variant_${idx}_minOrderQty`] ? "border-red-400 bg-red-50/20 focus:border-red-500" : ""
                          }`}
                          value={v.minOrderQty === 0 ? "" : v.minOrderQty}
                          placeholder="1"
                          onChange={(e) => {
                            const sanitized = e.target.value.replace(/[^0-9]/g, "");
                            const num = sanitized === "" ? 0 : Number(sanitized);
                            const copy = [...formVariants];
                            copy[idx].minOrderQty = num;
                            setFormVariants(copy);
                            if (productFormErrors[`variant_${idx}_minOrderQty`]) {
                              const next = { ...productFormErrors };
                              delete next[`variant_${idx}_minOrderQty`];
                              setProductFormErrors(next);
                            }
                          }}
                          required
                        />
                        {productFormErrors[`variant_${idx}_minOrderQty`] && (
                          <span className="text-[9px] text-red-600 font-semibold animate-fade-in">
                            ⚠️ {productFormErrors[`variant_${idx}_minOrderQty`]}
                          </span>
                        )}
                      </div>
                      <div className="sm:col-span-1.5 flex flex-col gap-0.5">
                        <label className="text-[9px] font-semibold text-gray-500 uppercase flex justify-between">
                          <span>Tồn kho</span>
                          <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          className={`text-input text-[11px] py-1 px-2 ${
                            productFormErrors[`variant_${idx}_stock`] ? "border-red-400 bg-red-50/20 focus:border-red-500" : ""
                          }`}
                          value={v.stock === 0 && !v.stock ? "0" : v.stock}
                          placeholder="0"
                          onChange={(e) => {
                            const sanitized = e.target.value.replace(/[^0-9]/g, "");
                            const num = sanitized === "" ? 0 : Number(sanitized);
                            const copy = [...formVariants];
                            copy[idx].stock = num;
                            setFormVariants(copy);
                            if (productFormErrors[`variant_${idx}_stock`]) {
                              const next = { ...productFormErrors };
                              delete next[`variant_${idx}_stock`];
                              setProductFormErrors(next);
                            }
                          }}
                          required
                        />
                        {productFormErrors[`variant_${idx}_stock`] && (
                          <span className="text-[9px] text-red-600 font-semibold animate-fade-in">
                            ⚠️ {productFormErrors[`variant_${idx}_stock`]}
                          </span>
                        )}
                      </div>
                      <div className="sm:col-span-1 flex justify-center pt-5">
                        <button
                          type="button"
                          className="w-6 h-6 rounded-full bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 hover:text-red-700 text-xs font-bold cursor-pointer transition"
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
          ref={categoryModalRef}
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/70 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
        >
          <div
            className="panel max-w-sm w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8"
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <h3 className="text-base font-bold text-orange-950 m-0 font-heading">Thêm danh mục sỉ mới</h3>
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
          ref={supplierModalRef}
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/70 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
        >
          <div
            className="panel max-w-2xl w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8"
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <h3 className="text-base font-bold text-orange-950 m-0 font-heading">
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
          ref={operationsModalRef}
          className="fixed inset-0 z-1000 overflow-y-auto bg-black/70 backdrop-filter backdrop-blur-sm animate-fade-in flex items-start justify-center p-4 sm:p-6"
        >
          <form
            onSubmit={handleCreateOperationsDocument}
            className="panel max-w-lg w-full p-6 flex flex-col gap-4 bg-[#FFFDF9] border-2 border-orange-200 animate-scale-in my-4 sm:my-8 text-xs"
            style={{ borderRadius: "1.75rem" }}
          >
            <div className="flex justify-between items-center border-b pb-2 border-orange-100">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-orange-950 m-0 font-heading">Lập chứng từ vận hành mới</h3>
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
