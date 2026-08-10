from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from typing import Dict, Any, List
import uuid
import datetime
from app.core.db import get_db
from app.services.inventory import get_available_stock, release_stock, consume_reservations

router = APIRouter()

@router.get("/available-stock", response_model=Dict[str, Any])
async def check_sku_availability(
    sku: str, 
    db: AsyncSession = Depends(get_db)
):
    """
    Kiểm tra tồn kho khả dụng thực tế của một SKU (Thực tế - Đang giữ chỗ sỉ).
    """
    qty = await get_available_stock(sku, db)
    return {
        "sku": sku,
        "available_qty": qty,
        "status": "in_stock" if qty > 0 else "out_of_stock"
    }

@router.post("/reservation", response_model=Dict[str, Any])
async def manage_stock_reservation(
    payload: Dict[str, Any], 
    db: AsyncSession = Depends(get_db)
):
    """
    Điều khiển trạng thái giữ chỗ kho. Gọi các PostgreSQL RPC functions trực tiếp qua raw SQL.
    """
    action = payload.get("action")
    order_id = payload.get("orderId")
    actor_id = payload.get("actorId", "system")
    expires_at = payload.get("expiresAt")
    reason = payload.get("reason", action)
    
    if not order_id or not action:
        raise HTTPException(status_code=400, detail="Thiếu orderId hoặc action.")
        
    try:
        if action == "reserve_order":
            res = await db.execute(
                text("SELECT pt_reserve_order_stock(:order_id, :actor_id, :expires_at)"),
                {"order_id": order_id, "actor_id": actor_id, "expires_at": expires_at}
            )
            result = res.scalar()
        else:
            res = await db.execute(
                text("SELECT pt_transition_order_stock_reservations(:order_id, :actor_id, :action, :reason)"),
                {"order_id": order_id, "actor_id": actor_id, "action": action, "reason": reason}
            )
            result = res.scalar()
            
        await db.commit()
        import json
        if isinstance(result, str):
            try:
                result = json.loads(result)
            except Exception:
                pass
                
        return {"status": "success", "result": result}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/overview", response_model=Dict[str, Any])
async def get_operations_overview(org_id: str = None, db: AsyncSession = Depends(get_db)):
    # 1. Fetch balances
    balance_sql = "SELECT id, warehouse_id, product_variant_id, sku, supplier_id, on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd FROM inventory_balances"
    if org_id:
        balance_sql += " WHERE organization_id = :org_id"
    
    r_balances = await db.execute(text(balance_sql), {"org_id": org_id} if org_id else {})
    balances = r_balances.mappings().all()
    
    on_hand_qty = sum(int(row["on_hand_qty"] or 0) for row in balances)
    reserved_qty = sum(int(row["reserved_qty"] or 0) for row in balances)
    defective_qty = sum(int(row["defective_qty"] or 0) for row in balances)
    inventory_value_vnd = sum(int(row["on_hand_qty"] or 0) * int(row["avg_cost_vnd"] or 0) for row in balances)
    
    # 2. Count docs
    r_pr = await db.execute(text("SELECT count(id) FROM operations_documents WHERE type = 'purchase_receipt' AND status IN ('draft', 'pending_review')" + (" AND organization_id = :org_id" if org_id else "")), {"org_id": org_id})
    open_purchase_receipts = r_pr.scalar() or 0
    
    r_si = await db.execute(text("SELECT count(id) FROM operations_documents WHERE type = 'sales_invoice' AND status IN ('draft', 'pending_review')" + (" AND organization_id = :org_id" if org_id else "")), {"org_id": org_id})
    pending_invoices = r_si.scalar() or 0
    
    r_ex = await db.execute(text("SELECT count(id) FROM operations_documents WHERE type = 'expense' AND status IN ('draft', 'pending_review')" + (" AND organization_id = :org_id" if org_id else "")), {"org_id": org_id})
    pending_expenses = r_ex.scalar() or 0
    
    # 3. Recent 12 docs
    docs_sql = "SELECT id, document_no, type, status, partner_name, total_amount, created_at FROM operations_documents"
    if org_id:
        docs_sql += " WHERE organization_id = :org_id"
    docs_sql += " ORDER BY created_at DESC LIMIT 12"
    r_docs = await db.execute(text(docs_sql), {"org_id": org_id} if org_id else {})
    docs = r_docs.mappings().all()
    
    recent_documents = [
        {
            "id": row["id"],
            "documentNo": row["document_no"],
            "type": row["type"],
            "status": row["status"],
            "partnerName": row["partner_name"] or None,
            "totalAmountVnd": int(row["total_amount"] or 0),
            "createdAt": row["created_at"].isoformat() if isinstance(row["created_at"], datetime.datetime) else str(row["created_at"])
        }
        for row in docs
    ]
    
    return {
        "inventory": {
            "onHandQty": on_hand_qty,
            "reservedQty": reserved_qty,
            "defectiveQty": defective_qty,
            "availableQty": max(0, on_hand_qty - reserved_qty - defective_qty),
            "inventoryValueVnd": inventory_value_vnd
        },
        "openPurchaseReceipts": open_purchase_receipts,
        "pendingInvoices": pending_invoices,
        "pendingExpenses": pending_expenses,
        "defectiveSkuCount": len([r for r in balances if int(r["defective_qty"] or 0) > 0]),
        "recentDocuments": recent_documents
    }

@router.post("/documents", response_model=Dict[str, Any])
async def create_operations_document(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    type_val = payload.get("type")
    document_no = payload.get("documentNo")
    partner_name = payload.get("partnerName")
    note = payload.get("note")
    lines = payload.get("lines", [])
    expense_category = payload.get("expenseCategory")
    amount_vnd = payload.get("amountVnd", 0)
    should_post = payload.get("shouldPost", False)
    user_id = payload.get("userId", "system")
    org_id = payload.get("organizationId")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="Thiếu organizationId.")
        
    # Get warehouse_id
    r_wh = await db.execute(text("SELECT id FROM warehouses WHERE organization_id = :org_id AND is_default = true AND active = true LIMIT 1"), {"org_id": org_id})
    warehouse_id = r_wh.scalar()
    if not warehouse_id:
        warehouse_id = str(uuid.uuid4())
        await db.execute(text("INSERT INTO warehouses (id, organization_id, code, name, is_default, active) VALUES (:id, :org_id, 'MAIN', 'Kho chính Pet Travel', true, true)"), {
            "id": warehouse_id,
            "org_id": org_id
        })
        
    line_total = sum(int(line.get("quantity", 0)) * int(line.get("unitCostVnd", 0)) for line in lines)
    total_amount = amount_vnd if type_val == "expense" else line_total
    document_id = str(uuid.uuid4())
    now = datetime.datetime.utcnow()
    
    if not document_no:
        document_no = f"{type_val.upper()}-{now.year}{now.month:02d}-{int(now.timestamp())}"
        
    status_val = "posted" if should_post else "draft"
    
    # Insert operations document
    await db.execute(text("""
        INSERT INTO operations_documents (id, organization_id, type, document_no, status, partner_name, total_amount, note, created_by, posted_by, posted_at, created_at)
        VALUES (:id, :org_id, :type, :document_no, :status, :partner_name, :total_amount, :note, :created_by, :posted_by, :posted_at, :created_at)
    """), {
        "id": document_id,
        "org_id": org_id,
        "type": type_val,
        "document_no": document_no,
        "status": status_val,
        "partner_name": partner_name,
        "total_amount": total_amount,
        "note": note,
        "created_by": user_id,
        "posted_by": user_id if should_post else None,
        "posted_at": now if should_post else None,
        "created_at": now
    })
    
    # Insert lines
    for idx, line in enumerate(lines):
        line_id = str(uuid.uuid4())
        sku = line.get("sku") or line.get("productVariantId") or f"MANUAL-{idx+1}"
        await db.execute(text("""
            INSERT INTO operations_document_lines (id, document_id, organization_id, line_no, product_variant_id, sku_snapshot, description, quantity, unit_cost, total_cost, supplier_id)
            VALUES (:id, :document_id, :org_id, :line_no, :product_variant_id, :sku_snapshot, :description, :quantity, :unit_cost, :total_cost, :supplier_id)
        """), {
            "id": line_id,
            "document_id": document_id,
            "org_id": org_id,
            "line_no": idx + 1,
            "product_variant_id": line.get("productVariantId"),
            "sku_snapshot": sku,
            "description": line.get("description", ""),
            "quantity": int(line.get("quantity", 0)),
            "unit_cost": int(line.get("unitCostVnd", 0)),
            "total_cost": int(line.get("quantity", 0)) * int(line.get("unitCostVnd", 0)),
            "supplier_id": line.get("supplierId")
        })
        
    # Expense Doc
    if type_val == "expense":
        await db.execute(text("""
            INSERT INTO expense_documents (id, organization_id, operations_document_id, expense_category, amount)
            VALUES (:id, :org_id, :operations_document_id, :expense_category, :amount)
        """), {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "operations_document_id": document_id,
            "expense_category": expense_category or "Chi phí phát sinh",
            "amount": total_amount
        })
        
    # Sales Invoice
    if type_val == "sales_invoice":
        await db.execute(text("""
            INSERT INTO business_invoices (id, organization_id, operations_document_id, invoice_no, invoice_type, status, partner_name, total_amount, issued_at)
            VALUES (:id, :org_id, :operations_document_id, :invoice_no, 'sales', :status, :partner_name, :total_amount, :issued_at)
        """), {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "operations_document_id": document_id,
            "invoice_no": document_no,
            "status": "issued" if should_post else "draft",
            "partner_name": partner_name,
            "total_amount": total_amount,
            "issued_at": now if should_post else None
        })
        
    # Post Inventory if shouldPost
    if should_post:
        for idx, line in enumerate(lines):
            qty = int(line.get("quantity", 0))
            sku = line.get("sku") or line.get("productVariantId") or f"MANUAL-{idx+1}"
            
            # Determine movement direction
            qty_delta = 0
            defective_delta = 0
            movement_type = "adjustment"
            
            if type_val == "purchase_receipt":
                movement_type = "purchase_in"
                qty_delta = qty
            elif type_val == "sales_invoice":
                movement_type = "sale_out"
                qty_delta = -qty
            elif type_val == "defect_report":
                movement_type = "defect_in"
                defective_delta = qty
            elif type_val == "stock_adjustment":
                movement_type = "adjustment"
                qty_delta = qty
                
            # Update inventory balance
            r_bal = await db.execute(text("SELECT id, on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd FROM inventory_balances WHERE organization_id = :org_id AND warehouse_id = :wh_id AND sku = :sku"), {
                "org_id": org_id,
                "wh_id": warehouse_id,
                "sku": sku
            })
            balance = r_bal.mappings().first()
            
            curr_on_hand = int(balance["on_hand_qty"] or 0) if balance else 0
            curr_reserved = int(balance["reserved_qty"] or 0) if balance else 0
            curr_defective = int(balance["defective_qty"] or 0) if balance else 0
            
            next_on_hand = curr_on_hand + qty_delta
            next_defective = curr_defective + defective_delta
            
            previous_value = curr_on_hand * int(balance["avg_cost_vnd"] or 0) if balance else 0
            incoming_value = qty_delta * int(line.get("unitCostVnd", 0)) if qty_delta > 0 else 0
            next_avg_cost = int((previous_value + incoming_value) / max(next_on_hand, 1)) if next_on_hand > 0 else (int(balance["avg_cost_vnd"] or 0) if balance else int(line.get("unitCostVnd", 0)))
            
            if balance:
                await db.execute(text("""
                    UPDATE inventory_balances 
                    SET on_hand_qty = :on_hand, reserved_qty = :reserved, defective_qty = :defective, avg_cost_vnd = :avg_cost, updated_at = :updated
                    WHERE id = :id
                """), {
                    "id": balance["id"],
                    "on_hand": next_on_hand,
                    "reserved": curr_reserved,
                    "defective": next_defective,
                    "avg_cost": max(0, next_avg_cost),
                    "updated": now
                })
            else:
                await db.execute(text("""
                    INSERT INTO inventory_balances (id, organization_id, warehouse_id, product_variant_id, sku, supplier_id, on_hand_qty, reserved_qty, defective_qty, avg_cost_vnd, updated_at)
                    VALUES (:id, :org_id, :wh_id, :product_variant_id, :sku, :supplier_id, :on_hand, :reserved, :defective, :avg_cost, :updated)
                """), {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "wh_id": warehouse_id,
                    "product_variant_id": line.get("productVariantId"),
                    "sku": sku,
                    "supplier_id": line.get("supplierId"),
                    "on_hand": next_on_hand,
                    "reserved": curr_reserved,
                    "defective": next_defective,
                    "avg_cost": max(0, next_avg_cost),
                    "updated": now
                })
                
            # Insert stock movement
            await db.execute(text("""
                INSERT INTO stock_movements (id, organization_id, warehouse_id, document_id, product_variant_id, sku_snapshot, movement_type, quantity_delta, defective_delta, unit_cost, created_by, created_at)
                VALUES (:id, :org_id, :wh_id, :document_id, :product_variant_id, :sku, :m_type, :qty_delta, :def_delta, :unit_cost, :created_by, :created_at)
            """), {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "wh_id": warehouse_id,
                "document_id": document_id,
                "product_variant_id": line.get("productVariantId"),
                "sku": sku,
                "m_type": movement_type,
                "qty_delta": qty_delta,
                "def_delta": defective_delta,
                "unit_cost": int(line.get("unitCostVnd", 0)),
                "created_by": user_id,
                "created_at": now
            })
            
    await db.commit()
    
    return {
        "id": document_id,
        "documentNo": document_no,
        "type": type_val,
        "status": status_val,
        "partnerName": partner_name,
        "totalAmountVnd": total_amount,
        "createdAt": now.isoformat()
    }
