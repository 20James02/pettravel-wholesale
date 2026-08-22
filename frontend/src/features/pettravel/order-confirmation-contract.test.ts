import assert from "node:assert";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = readFileSync(new URL("./PetTravelApp.tsx", import.meta.url), "utf8");
const adminOrdersSource = readFileSync(
  new URL("./components/admin/AdminOrders.tsx", import.meta.url),
  "utf8"
);
const orderTimelineSource = readFileSync(
  new URL("./components/customer/OrderTimeline.tsx", import.meta.url),
  "utf8"
);
const chatPopupSource = readFileSync(
  new URL("./components/shared/ChatPopup.tsx", import.meta.url),
  "utf8"
);

describe("two-way quote confirmation pending states", () => {
  it("keeps every admin publish button disabled with a visible loader until the request settles", () => {
    assert.ok(adminOrdersSource.includes("handlePublishQuote: (customNote?: string) => Promise<boolean>"));
    assert.ok(adminOrdersSource.includes("const [isPublishingQuote, setIsPublishingQuote]"));
    assert.ok(adminOrdersSource.includes("await handlePublishQuote"));
    assert.ok(adminOrdersSource.includes("disabled={quoteEditingDisabled || isPublishingQuote}"));
    assert.ok(adminOrdersSource.includes("aria-busy={isPublishingQuote}"));
    assert.ok(adminOrdersSource.includes("Đang gửi báo giá..."));
    assert.ok(adminOrdersSource.includes("animate-spin"));
    assert.ok(appSource.includes("async function handlePublishQuote(customNote?: string): Promise<boolean>"));
  });

  it("disables customer quote acceptance and shows a loader until its request settles", () => {
    assert.ok(orderTimelineSource.includes("onAcceptQuote?: () => Promise<boolean>"));
    assert.ok(orderTimelineSource.includes("const [isAcceptingQuote, setIsAcceptingQuote]"));
    assert.ok(orderTimelineSource.includes("await onAcceptQuote()"));
    assert.ok(orderTimelineSource.includes("disabled={isAcceptingQuote}"));
    assert.ok(orderTimelineSource.includes("aria-busy={isAcceptingQuote}"));
    assert.ok(orderTimelineSource.includes("Đang xác nhận..."));
    assert.ok(orderTimelineSource.includes("animate-spin"));
    assert.ok(appSource.includes("async function handleCustomerAcceptQuote(): Promise<boolean>"));
  });

  it("keeps customer updates and payment proof uploads pending until persistence succeeds", () => {
    assert.ok(orderTimelineSource.includes("onUploadProof: (file: File) => Promise<boolean>"));
    assert.ok(orderTimelineSource.includes("const [isUploadingProof, setIsUploadingProof]"));
    assert.ok(orderTimelineSource.includes("Đang tải và xác nhận minh chứng..."));
    assert.ok(orderTimelineSource.includes("onRequestOrderChange?: (reason: string) => Promise<boolean>"));
    assert.ok(orderTimelineSource.includes("const [isRequestingChange, setIsRequestingChange]"));
    assert.ok(orderTimelineSource.includes("Đang gửi yêu cầu..."));
    assert.ok(orderTimelineSource.includes("const saved = await onUpdateRecipientInfo"));
    assert.ok(orderTimelineSource.includes("if (saved) setIsEditRecipientOpen(false)"));
    assert.ok(appSource.includes("async function handleCustomerRequestChange(reason: string): Promise<boolean>"));
    assert.ok(appSource.includes("async function uploadPaymentProof(file: File): Promise<boolean>"));
  });

  it("keeps the chat draft until the message is persisted", () => {
    assert.ok(chatPopupSource.includes("onSendComment: (message: string, isInternal: boolean) => Promise<boolean>"));
    assert.ok(chatPopupSource.includes("const [isSending, setIsSending]"));
    assert.ok(chatPopupSource.includes("const sent = await onSendComment"));
    assert.ok(chatPopupSource.includes('if (sent) setChatInput("")'));
    assert.ok(chatPopupSource.includes("Đang gửi..."));
    assert.ok(appSource.includes("message: string): Promise<boolean>"));
  });

  it("serializes admin confirmation actions and exposes their pending state", () => {
    assert.ok(adminOrdersSource.includes("const pendingAdminActionRef = useRef"));
    assert.ok(adminOrdersSource.includes("if (pendingAdminActionRef.current) return false"));
    assert.ok(adminOrdersSource.includes('runAdminAction("confirm_payment", confirmDeposit)'));
    assert.ok(adminOrdersSource.includes('runAdminAction("reject_payment", rejectPaymentProof)'));
    assert.ok(adminOrdersSource.includes('runAdminAction("reissue_payment", reissuePaymentRequest)'));
    assert.ok(adminOrdersSource.includes('runAdminAction("advance_fulfillment"'));
    assert.ok(adminOrdersSource.includes('runAdminAction("post_accounting"'));
    assert.ok(adminOrdersSource.includes("Đang đối soát..."));
    assert.ok(adminOrdersSource.includes("Đang cập nhật..."));
    assert.ok(adminOrdersSource.includes("Đang ghi sổ..."));
    assert.ok(appSource.includes("async function confirmDeposit(): Promise<boolean>"));
    assert.ok(appSource.includes("async function rejectPaymentProof(): Promise<boolean>"));
    assert.ok(appSource.includes("async function reissuePaymentRequest(): Promise<boolean>"));
  });

  it("waits for server persistence before showing a new staff assignment", () => {
    const start = adminOrdersSource.indexOf("const handleStaffSelect");
    const end = adminOrdersSource.indexOf("// Latest Quote calculation", start);
    const handlerSource = adminOrdersSource.slice(start, end);

    assert.ok(handlerSource.includes('runAdminAction("assign_staff", () => syncOrder(updatedOrder))'));
    assert.ok(handlerSource.indexOf("setWorkingOrder(updatedOrder)") > handlerSource.indexOf("} else {"));
    assert.ok(adminOrdersSource.includes("Đang lưu phân công..."));
  });

  it("keeps one realtime stream across order selection and refreshes the selected detail", () => {
    assert.ok(appSource.includes("const selectedOrderIdRef = useRef<string | null>(null)"));
    assert.ok(appSource.includes("const isOrderModifiedRef = useRef<boolean>(false)"));
    assert.ok(appSource.includes("const currentSelectedOrderId = selectedOrderIdRef.current"));
    assert.ok(appSource.includes("const selectedOrder = nextOrders.find"));
    assert.ok(appSource.includes("if (selectedOrder && !isOrderModifiedRef.current)"));
    assert.ok(appSource.includes("}, [currentUser, fetchOrders])"));
  });

  it("loads role permissions before enabling the admin order workspace", () => {
    const adminTabStart = appSource.indexOf('} else if (currentTab === "admin") {');
    const nextTabBranch = appSource.indexOf('} else if (currentTab === "admin_accounting")', adminTabStart);
    const adminTabLoader = appSource.slice(adminTabStart, nextTabBranch);

    assert.ok(adminTabStart >= 0);
    assert.ok(adminTabLoader.includes("fetchAdminData()"));
  });
});
