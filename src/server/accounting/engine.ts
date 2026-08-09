export type PaymentIntent = "deposit_cod" | "pay_full";
export type AdjustmentKind = "discount" | "free_shipping" | "offer" | "shipping_fee";
export type JournalSide = "debit" | "credit";

const BASIS_POINTS = 10_000n;
const MAX_SAFE_VND = BigInt(Number.MAX_SAFE_INTEGER);

export class AccountingError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.code = code;
    this.name = "AccountingError";
  }
}

export interface QuoteLineInput {
  id: string;
  productCode: string;
  variantSku: string;
  supplierId: string;
  quantity: number;
  unitPriceVnd: number;
}

export interface QuoteAdjustmentInput {
  id: string;
  type: AdjustmentKind;
  label: string;
  amountVnd: number;
}

export interface FinancialSnapshotInput {
  lines: QuoteLineInput[];
  adjustments?: QuoteAdjustmentInput[];
  paymentIntent: PaymentIntent;
  depositRateBps?: number;
  depositAmountVnd?: number;
}

export interface AppliedAdjustment {
  id: string;
  type: AdjustmentKind;
  label: string;
  amountVnd: number;
  signedAmountVnd: number;
}

export interface FinancialSnapshot {
  subtotalVnd: number;
  adjustmentTotalVnd: number;
  finalTotalVnd: number;
  depositAmountVnd: number;
  codRemainingVnd: number;
  paymentDueNowVnd: number;
  appliedAdjustments: AppliedAdjustment[];
}

export interface JournalLineDraft {
  accountCode: string;
  accountName: string;
  side: JournalSide;
  amountVnd: number;
  memo?: string;
  partnerId?: string;
  orderId?: string;
}

export interface JournalEntryDraft {
  sourceType: "payment_request" | "order" | "shipment" | "manual_adjustment";
  sourceId: string;
  idempotencyKey: string;
  description: string;
  lines: JournalLineDraft[];
}

export interface DepositReceiptInput {
  orderId: string;
  paymentRequestId: string;
  amountVnd: number;
  idempotencyKey: string;
  bankAccountCode?: string;
  customerAccountCode?: string;
}

export interface SaleRecognitionInput {
  orderId: string;
  totalVnd: number;
  vatRateBps: number;
  costOfGoodsSoldVnd?: number;
  idempotencyKey: string;
  receivableAccountCode?: string;
  revenueAccountCode?: string;
  outputVatAccountCode?: string;
  inventoryAccountCode?: string;
  cogsAccountCode?: string;
}

export interface CodCollectionInput {
  orderId: string;
  amountVnd: number;
  idempotencyKey: string;
  cashOrBankAccountCode?: string;
  receivableAccountCode?: string;
}

function ensureInteger(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new AccountingError(`${field} must be an integer.`, "NON_INTEGER_VALUE");
  }
}

export function assertVndAmount(value: number, field = "amount"): number {
  ensureInteger(value, field);
  if (!Number.isSafeInteger(value)) {
    throw new AccountingError(`${field} is outside the safe integer range.`, "UNSAFE_MONEY_VALUE");
  }
  if (value < 0) {
    throw new AccountingError(`${field} cannot be negative.`, "NEGATIVE_MONEY_VALUE");
  }

  return value;
}

function toSafeNumber(value: bigint, field: string): number {
  if (value > MAX_SAFE_VND) {
    throw new AccountingError(`${field} is outside the safe integer range.`, "UNSAFE_MONEY_VALUE");
  }
  return Number(value);
}

function assertBasisPoints(value: number, field = "basisPoints"): number {
  ensureInteger(value, field);
  if (value < 0 || value > 100_000) {
    throw new AccountingError(`${field} must be between 0 and 100000.`, "INVALID_BASIS_POINTS");
  }
  return value;
}

export function multiplyVnd(unitPriceVnd: number, quantity: number, field = "lineTotal"): number {
  assertVndAmount(unitPriceVnd, "unitPriceVnd");
  ensureInteger(quantity, "quantity");
  if (quantity <= 0) {
    throw new AccountingError("quantity must be greater than 0.", "INVALID_QUANTITY");
  }

  return toSafeNumber(BigInt(unitPriceVnd) * BigInt(quantity), field);
}

export function addVnd(amounts: number[], field = "total"): number {
  const total = amounts.reduce((sum, amount, index) => {
    assertVndAmount(amount, `${field}[${index}]`);
    return sum + BigInt(amount);
  }, 0n);

  return toSafeNumber(total, field);
}

export function roundVndByBps(amountVnd: number, bps: number, field = "percentageAmount"): number {
  assertVndAmount(amountVnd, "amountVnd");
  assertBasisPoints(bps, "bps");

  const numerator = BigInt(amountVnd) * BigInt(bps);
  return toSafeNumber((numerator + BASIS_POINTS / 2n) / BASIS_POINTS, field);
}

function signedAdjustmentAmount(adjustment: QuoteAdjustmentInput): number {
  const amount = assertVndAmount(adjustment.amountVnd, `adjustment:${adjustment.id}`);
  if (adjustment.type === "shipping_fee") return amount;
  return -amount;
}

export function calculateFinancialSnapshot(input: FinancialSnapshotInput): FinancialSnapshot {
  if (input.lines.length === 0) {
    throw new AccountingError("At least one quote line is required.", "EMPTY_QUOTE_LINES");
  }

  const lineTotals = input.lines.map((line) => multiplyVnd(line.unitPriceVnd, line.quantity, `line:${line.id}`));
  const subtotalVnd = addVnd(lineTotals, "subtotalVnd");

  const appliedAdjustments = (input.adjustments ?? []).map((adjustment) => ({
    id: adjustment.id,
    type: adjustment.type,
    label: adjustment.label,
    amountVnd: assertVndAmount(adjustment.amountVnd, `adjustment:${adjustment.id}`),
    signedAmountVnd: signedAdjustmentAmount(adjustment)
  }));

  const adjustmentTotal = appliedAdjustments.reduce((sum, adjustment) => sum + BigInt(adjustment.signedAmountVnd), 0n);
  const finalTotalBig = BigInt(subtotalVnd) + adjustmentTotal;
  if (finalTotalBig < 0n) {
    throw new AccountingError("Adjustments cannot make final total negative.", "NEGATIVE_FINAL_TOTAL");
  }

  const finalTotalVnd = toSafeNumber(finalTotalBig, "finalTotalVnd");
  let depositAmountVnd = 0;
  let codRemainingVnd = 0;
  let paymentDueNowVnd = finalTotalVnd;

  if (input.paymentIntent === "deposit_cod") {
    depositAmountVnd = input.depositAmountVnd === undefined
      ? roundVndByBps(finalTotalVnd, input.depositRateBps ?? 0, "depositAmountVnd")
      : assertVndAmount(input.depositAmountVnd, "depositAmountVnd");

    if (depositAmountVnd <= 0 && finalTotalVnd > 0) {
      throw new AccountingError("Deposit/COD orders require a positive deposit.", "INVALID_DEPOSIT_AMOUNT");
    }
    if (depositAmountVnd > finalTotalVnd) {
      throw new AccountingError("Deposit cannot be greater than final total.", "DEPOSIT_EXCEEDS_TOTAL");
    }

    codRemainingVnd = finalTotalVnd - depositAmountVnd;
    paymentDueNowVnd = depositAmountVnd;
  }

  return {
    subtotalVnd,
    adjustmentTotalVnd: toSafeNumber(adjustmentTotal, "adjustmentTotalVnd"),
    finalTotalVnd,
    depositAmountVnd,
    codRemainingVnd,
    paymentDueNowVnd,
    appliedAdjustments
  };
}

export function getJournalTotals(lines: JournalLineDraft[]) {
  const totals = lines.reduce(
    (acc, line, index) => {
      const amount = assertVndAmount(line.amountVnd, `journalLine:${index}`);
      if (amount <= 0) {
        throw new AccountingError("Journal line amount must be greater than 0.", "INVALID_JOURNAL_LINE_AMOUNT");
      }
      if (!line.accountCode.trim() || !line.accountName.trim()) {
        throw new AccountingError("Journal line account is required.", "MISSING_ACCOUNT");
      }

      if (line.side === "debit") acc.debit += BigInt(amount);
      if (line.side === "credit") acc.credit += BigInt(amount);
      return acc;
    },
    { debit: 0n, credit: 0n }
  );

  return {
    debitVnd: toSafeNumber(totals.debit, "debitVnd"),
    creditVnd: toSafeNumber(totals.credit, "creditVnd")
  };
}

export function assertBalancedJournalEntry(entry: JournalEntryDraft): JournalEntryDraft {
  if (entry.lines.length < 2) {
    throw new AccountingError("Journal entry must have at least two lines.", "TOO_FEW_JOURNAL_LINES");
  }
  if (!entry.idempotencyKey.trim()) {
    throw new AccountingError("Idempotency key is required.", "MISSING_IDEMPOTENCY_KEY");
  }

  const totals = getJournalTotals(entry.lines);
  if (totals.debitVnd !== totals.creditVnd) {
    throw new AccountingError("Journal entry is not balanced.", "UNBALANCED_JOURNAL_ENTRY");
  }

  return entry;
}

export function createDepositReceiptEntry(input: DepositReceiptInput): JournalEntryDraft {
  const amount = assertVndAmount(input.amountVnd, "depositAmountVnd");
  if (amount <= 0) {
    throw new AccountingError("Deposit amount must be greater than 0.", "INVALID_DEPOSIT_AMOUNT");
  }

  return assertBalancedJournalEntry({
    sourceType: "payment_request",
    sourceId: input.paymentRequestId,
    idempotencyKey: input.idempotencyKey,
    description: `Confirm deposit for order ${input.orderId}`,
    lines: [
      {
        accountCode: input.bankAccountCode ?? "1121",
        accountName: "Tien gui ngan hang VND",
        side: "debit",
        amountVnd: amount,
        orderId: input.orderId
      },
      {
        accountCode: input.customerAccountCode ?? "131",
        accountName: "Phai thu cua khach hang",
        side: "credit",
        amountVnd: amount,
        orderId: input.orderId
      }
    ]
  });
}

function splitVatInclusive(totalVnd: number, vatRateBps: number) {
  assertVndAmount(totalVnd, "totalVnd");
  assertBasisPoints(vatRateBps, "vatRateBps");
  const denominator = BASIS_POINTS + BigInt(vatRateBps);
  const vat = toSafeNumber((BigInt(totalVnd) * BigInt(vatRateBps) + denominator / 2n) / denominator, "vatAmountVnd");
  return {
    netRevenueVnd: totalVnd - vat,
    vatAmountVnd: vat
  };
}

export function createSaleRecognitionEntry(input: SaleRecognitionInput): JournalEntryDraft {
  const totalVnd = assertVndAmount(input.totalVnd, "totalVnd");
  if (totalVnd <= 0) {
    throw new AccountingError("Sale total must be greater than 0.", "INVALID_SALE_TOTAL");
  }

  const { netRevenueVnd, vatAmountVnd } = splitVatInclusive(totalVnd, input.vatRateBps);
  const cogs = assertVndAmount(input.costOfGoodsSoldVnd ?? 0, "costOfGoodsSoldVnd");

  const lines: JournalLineDraft[] = [
    {
      accountCode: input.receivableAccountCode ?? "131",
      accountName: "Phai thu cua khach hang",
      side: "debit",
      amountVnd: totalVnd,
      orderId: input.orderId
    },
    {
      accountCode: input.revenueAccountCode ?? "5111",
      accountName: "Doanh thu ban hang hoa",
      side: "credit",
      amountVnd: netRevenueVnd,
      orderId: input.orderId
    }
  ];

  if (vatAmountVnd > 0) {
    lines.push({
      accountCode: input.outputVatAccountCode ?? "33311",
      accountName: "Thue GTGT dau ra",
      side: "credit",
      amountVnd: vatAmountVnd,
      orderId: input.orderId
    });
  }

  if (cogs > 0) {
    lines.push(
      {
        accountCode: input.cogsAccountCode ?? "632",
        accountName: "Gia von hang ban",
        side: "debit",
        amountVnd: cogs,
        orderId: input.orderId
      },
      {
        accountCode: input.inventoryAccountCode ?? "156",
        accountName: "Hang hoa",
        side: "credit",
        amountVnd: cogs,
        orderId: input.orderId
      }
    );
  }

  return assertBalancedJournalEntry({
    sourceType: "order",
    sourceId: input.orderId,
    idempotencyKey: input.idempotencyKey,
    description: `Recognize sale for order ${input.orderId}`,
    lines
  });
}

export function createCodCollectionEntry(input: CodCollectionInput): JournalEntryDraft {
  const amount = assertVndAmount(input.amountVnd, "codAmountVnd");
  if (amount <= 0) {
    throw new AccountingError("COD amount must be greater than 0.", "INVALID_COD_AMOUNT");
  }

  return assertBalancedJournalEntry({
    sourceType: "payment_request",
    sourceId: input.orderId,
    idempotencyKey: input.idempotencyKey,
    description: `Collect COD for order ${input.orderId}`,
    lines: [
      {
        accountCode: input.cashOrBankAccountCode ?? "1111",
        accountName: "Tien mat VND",
        side: "debit",
        amountVnd: amount,
        orderId: input.orderId
      },
      {
        accountCode: input.receivableAccountCode ?? "131",
        accountName: "Phai thu cua khach hang",
        side: "credit",
        amountVnd: amount,
        orderId: input.orderId
      }
    ]
  });
}
