# BÁO CÁO TOÀN DIỆN: ĐÁNH GIÁ THUẬT TOÁN NGHIỆP VỤ & LỘ TRÌNH PHÁT TRIỂN TÍNH NĂNG PET TRAVEL WHOLESALE

---

## 1. MA TRẬN ĐÁNH GIÁ TỔNG THỂ CÁC KHỐI NGHIỆP VỤ

| Khối Chức năng | Hiện trạng triển khai | Mức độ đầy đủ | Điểm mạnh cốt lõi | Điểm nghẽn / Khoảng trống nghiệp vụ |
| :--- | :--- | :---: | :--- | :--- |
| **1. Định giá & Báo giá Sỉ (Pricing & Quoting)** | `wholesalePrice`, MOQ, Quote Adjustment tĩnh | **70%** | Phân tách DTO bảo mật (Zero price leak cho Guest), lưu snapshot giá tại thời điểm chốt đơn | Chưa có bậc thang số lượng (Volume Tiers), chưa có bảng giá theo cấp đại lý (Customer Tier Pricing) |
| **2. Toán học Tiền tệ & Kế toán Kép (Financial & Accounting)** | BigInt basis-point math (10.000 bps), Sổ cái kép (Debit/Credit) | **90%** | Triệt tiêu hoàn toàn floating-point error, tự động cân bằng Nợ/Có, idempotency key | Chưa có thuật toán phân bổ chiết khấu Pro-rata cho từng SKU để tính COGS khi hoàn hàng từng phần |
| **3. Giữ chỗ Kho & Tồn kho Khả dụng (Inventory & ATP)** | PostgreSQL RPC reservation, TTL auto-expire, Safety lock | **85%** | Chống race condition & over-selling khi nhiều đại lý tranh chấp tồn kho cùng lúc | Chưa có thuật toán tự động tính điểm đặt hàng lại (Reorder Point - ROP) và quản lý Lô/Hạn sử dụng (FEFO) |
| **4. Điều phối Đơn hàng Đa NCC (Multi-Supplier Fulfillment)** | Phân nhóm theo `supplierId`, tracking shipment riêng | **75%** | Hỗ trợ mô hình Dropship B2B & gom hàng từ nhiều kho | Chưa có thuật toán tối ưu hóa cước vận chuyển gộp (Consolidated Shipping Cost Optimization) |
| **5. Khuyến mãi & Chiết khấu (Promotion Engine)** | Voucher code, kiểm tra giá trị đơn tối thiểu | **60%** | Kiểm tra điều kiện đơn giản, áp dụng vào Quote version | Chưa có cây điều kiện động (Rule Graph AST), chưa hỗ trợ cơ chế tặng hàng mẫu BOGO (Buy X Get Y) |
| **6. Quản lý Công nợ & Vòng đời Đơn (Credit & Order Lifecycle)** | 8 trạng thái thương mại, 9 trạng thái thanh toán, cọc/COD | **80%** | State machine rõ ràng, luồng duyệt cọc qua ảnh chứng từ thanh toán | Chưa có hạn mức tín dụng công nợ (Credit Limit) và phân tích tuổi nợ (Aging Schedule 30/60/90 ngày) |

---

## 2. ĐÁNH GIÁ CHI TIẾT CÁC THUẬT TOÁN NGHIỆP VỤ CỐT LÕI

### 2.1. Thuật toán Tính toán Tài chính & Tiền tệ (`engine.ts`)
- **Nguyên lý hoạt động**:
  Sử dụng số nguyên BigInt với đơn vị cơ bản là Điểm cơ bản (Basis Points - BPS: $1\% = 100\text{ bps}$, $100\% = 10.000\text{ bps}$).
  $$\text{Amount}_{\text{VND}} = \left\lfloor \frac{\text{Principal} \times \text{Rate}_{\text{bps}} + 5.000}{10.000} \right\rfloor$$
- **Đánh giá**:
  - ✅ **Ưu điểm**: Khắc phục triệt để sai số dấu phẩy động của JavaScript (`0.1 + 0.2 \neq 0.3`). Chặn toàn bộ số âm, số thập phân không hợp lệ và kiểm tra tính toàn vẹn `finalTotal = subtotal - discount + shipping`.
  - ⚠️ **Hạn chế**: Khi áp dụng giảm giá tổng đơn (ví dụ giảm $500.000\text{đ}$ cho đơn gồm 3 SKU khác nhau), số tiền giảm đang nằm ở cấp độ Order Header chứ chưa được phân bổ ngược lại (Pro-rata) vào từng SKU (`OrderItem`).

### 2.2. Thuật toán Giữ chỗ Tồn kho Khả dụng (Available-to-Promise - ATP)
- **Nguyên lý hoạt động**:
  $$\text{Stock}_{\text{available}} = \text{Stock}_{\text{physical}} - \sum \text{Stock}_{\text{reserved active}}$$
  - Khi khách gửi đơn sỉ hoặc chốt báo giá $\rightarrow$ Kích hoạt `pt_reserve_order_stock` với `expiresAt` (mặc định $24\text{h} - 48\text{h}$).
  - Nếu khách hủy hoặc quá hạn thanh toán cọc $\rightarrow$ Worker/Trigger tự động giải phóng tồn kho (`release_order` / `expire_order`).
  - Khi xác nhận giao hàng $\rightarrow$ Chuyển từ trạng thái giữ chỗ sang tiêu trừ thực tế (`consume_order`).
- **Đánh giá**:
  - ✅ **Ưu điểm**: Thực thi ở mức database transaction cô lập, an toàn cao, không bao giờ bị over-selling.
  - ⚠️ **Hạn chế**: Chưa hỗ trợ ưu tiên giữ hàng theo cấp bậc khách hàng (ví dụ: Khách VIP được ưu tiên phân bổ trước khi tồn kho sắp hết).

### 2.3. Thuật toán Hạch toán Kế toán Kép (Double-Entry General Ledger)
- **Bút toán tự động hiện tại**:
  1. *Thu cọc đơn sỉ*: Nợ TK 112 (Tiền gửi NH) / Có TK 131 (Phải thu khách hàng - Tiền cọc).
  2. *Giao hàng & Ghi nhận Doanh thu*:
     - Doanh thu: Nợ TK 131 / Có TK 511 (Doanh thu bán sỉ), Có TK 3331 (Thuế GTGT đầu ra).
     - Giá vốn: Nợ TK 632 (Giá vốn hàng bán) / Có TK 156 (Hàng hóa tồn kho).
  3. *Thu nốt tiền COD còn lại*: Nợ TK 112 / Có TK 131.
- **Đánh giá**: Cực kỳ bài bản, chuẩn mực kế toán VAS/IFRS cho thương mại điện tử.

---

## 3. ĐỀ XUẤT CẢI TIẾN THUẬT TOÁN CỐT LÕI (KÈM CÔNG THỨC & LOGIC)

### 3.1. Thuật toán Định giá Bậc thang Số lượng (Tiered Volume Pricing Algorithm)
- **Mục tiêu**: Khuyến khích đại lý gom đơn số lượng lớn bằng cách tự động giảm giá đơn vị theo các mốc số lượng mua.
- **Công thức tính toán**:
  Giả sử SKU có bảng bậc thang: $[(Q_1, D_1), (Q_2, D_2), \dots, (Q_k, D_k)]$ với $Q_i$ là số lượng tối thiểu và $D_i$ là tỷ lệ giảm giá (BPS):
  $$\text{DiscountRate}(q) = \max \left\{ D_i \mid q \ge Q_i \right\}$$
  $$\text{EffectiveUnitPrice}(q) = \left\lfloor \text{BasePrice} \times \left(1 - \frac{\text{DiscountRate}(q)}{10.000}\right) \right\rfloor$$
- **Cơ chế bảo vệ Biên lợi nhuận (Margin Floor Protection)**:
  $$\text{EffectiveUnitPrice}(q) \ge \text{COGS} \times (1 + \text{MinMarginRate})$$
  *(Tránh trường hợp nhân viên áp voucher chồng bậc thang làm giá bán thấp hơn giá nhập).*

### 3.2. Thuật toán Phân bổ Chiết khấu Pro-Rata (Pro-Rata Discount Allocation)
- **Mục tiêu**: Chia đều số tiền giảm giá tổng (Order-level Discount) về từng sản phẩm con theo tỷ trọng giá trị.
- **Thuật toán**:
  Cho đơn hàng có $n$ dòng sản phẩm với giá trị dòng $V_i = \text{Qty}_i \times \text{UnitPrice}_i$, tổng phụ $\text{Subtotal} = \sum_{i=1}^n V_i$, và tổng giảm giá $D$.
  1. Với mỗi dòng $i < n$:
     $$d_i = \left\lfloor \frac{D \times V_i}{\text{Subtotal}} \right\rfloor$$
  2. Dòng cuối cùng $n$ chịu phần dư làm tròn (chống thất thoát lẻ 1đ):
     $$d_n = D - \sum_{i=1}^{n-1} d_i$$
  3. Giá trị thực thu của từng dòng $i$:
     $$V_{\text{net}, i} = V_i - d_i$$

### 3.3. Thuật toán Tự động Tính Điểm Đặt Hàng Lại (Safety Stock & Reorder Point - ROP)
- **Mục tiêu**: Báo động cho bộ phận kho nhập thêm hàng trước khi hết sạch tồn sỉ.
- **Công thức**:
  $$\text{SafetyStock} = Z \times \sqrt{L \times \sigma_d^2 + \bar{d}^2 \times \sigma_L^2}$$
  $$\text{ROP} = (\bar{d} \times L) + \text{SafetyStock}$$
  - $\bar{d}$: Nhu cầu tiêu thụ trung bình ngày của SKU.
  - $L$: Lead time giao hàng từ nhà cung cấp (số ngày).
  - $Z$: Hệ số mức độ phục vụ (Service Level, ví dụ 95% $\rightarrow Z = 1.65$).
  - $\sigma_d, \sigma_L$: Độ lệch chuẩn của nhu cầu và thời gian giao hàng.

### 3.4. Thuật toán Phân bổ Giảm giá Đơn hàng Nhiều Kho (Multi-Warehouse Split Order Router)
- **Mục tiêu**: Khi khách đặt giỏ hàng gồm nhiều sản phẩm nằm ở các NCC/Kho khác nhau:
  1. **Bước 1**: Đánh giá ma trận tồn kho $\mathcal{M}_{S \times K}$ (Sản phẩm $\times$ Kho/NCC).
  2. **Bước 2 (Minimum Split Heuristic)**: Tìm tập kho nhỏ nhất $\mathcal{K}_{\min}$ có thể đáp ứng đủ toàn bộ sản phẩm trong giỏ hàng để giảm thiểu số kiện hàng phải đóng và tiền cước vận chuyển.
  3. **Bước 3**: Tự động sinh ra các `FulfillmentGroup` riêng biệt kèm `Shipment` độc lập.

---

## 4. LỘ TRÌNH ĐỀ XUẤT BỔ SUNG TÍNH NĂNG (FEATURE ROADMAP)

### 🌟 Giai đoạn 1: Nâng cấp Động cơ Định giá & Quản lý Đại lý (Pricing & B2B CRM)
1. **Tiered Volume Pricing (Bảng giá theo số lượng)**:
   - Cấu hình trực tiếp trong Admin Inventory: Mua $10-49$ cái (giá $100.000\text{đ}$), $50-199$ cái (giá $92.000\text{đ}$), $\ge 200$ cái (giá $85.000\text{đ}$).
   - Frontend hiển thị bảng giá sỉ trực quan ngay trên trang chi tiết sản phẩm.
2. **Customer Tier / Price List (Bảng giá riêng theo nhóm đại lý)**:
   - Nhóm: *Đại lý Tiềm năng*, *Đại lý Bạc*, *Đại lý Vàng*, *Tổng Đại lý Cấp 1*.
   - Khách đăng nhập sẽ tự động nhìn thấy bảng giá ưu đãi tương ứng với thứ hạng tài khoản của mình.
3. **Discount Approval Matrix (Ma trận duyệt chiết khấu)**:
   - Nhân viên kinh doanh chỉ được nhập chiết khấu tối đa $5\%$.
   - Chiết khấu $5\% - 10\%$ cần Manager duyệt; trên $10\%$ cần Super Admin duyệt trực tiếp trên Order Timeline.

### 📦 Giai đoạn 2: Vận hành Kho & Quản lý Chuỗi Cung ứng (Smart Operations & SCM)
1. **Batch / Lot & Expiry Date Tracking (Quản lý Lô & Date)**:
   - Đặc thù ngành thú cưng: Thức ăn khô, pate, sữa, thuốc thú y có hạn dùng.
   - Quản lý ngày sản xuất, hạn sử dụng theo từng lô nhập hàng (`purchase_receipt`), xuất kho ưu tiên cận date trước (FEFO - First Expired, First Out).
2. **Reorder Point & Inventory Health Dashboard (Bảng điều khiển sức khỏe tồn kho)**:
   - Tự động đánh dấu các mặt hàng: *An toàn*, *Sắp hết hàng (Dưới ROP)*, *Hết hàng*, *Tồn đọng quá 90 ngày (Dead Stock)*.

### 💳 Giai đoạn 3: Tài chính Nâng cao & Quản trị Công nợ B2B (Credit & Debt Management)
1. **B2B Credit Limit & Terms (Hạn mức & Kỳ hạn Công nợ)**:
   - Cấp hạn mức nợ cho từng đại lý (ví dụ: Nợ tối đa $50.000.000\text{đ}$, thời hạn thanh toán Net 30 ngày).
   - Nếu đơn mới vượt hạn mức hoặc có hóa đơn quá hạn chưa thanh toán $\rightarrow$ Khóa đặt sỉ trả sau, bắt buộc thanh toán $100\%$ trước khi giao hàng.
2. **Accounts Receivable Aging Report (Báo cáo Tuổi nợ Khách hàng)**:
   - Bảng phân tích công nợ theo các cột: *Trong hạn*, *Quá hạn 1-30 ngày*, *Quá hạn 31-60 ngày*, *Quá hạn >60 ngày*.
   - Tích hợp gửi email / thông báo nhắc nợ tự động định kỳ.

---

## 5. TỔNG KẾT & ĐỀ XUẤT ƯU TIÊN THỰC THI

1. **Ưu tiên 1**: Tích hợp bảng giá sỉ bậc thang số lượng (**Volume Tiered Pricing**) để kích thích tăng giá trị trung bình trên mỗi đơn hàng (AOV).
2. **Ưu tiên 2**: Cải tiến thuật toán phân bổ chiết khấu **Pro-Rata** trong `engine.ts` để tối ưu tính toán giá vốn khi có phát sinh đổi trả.
