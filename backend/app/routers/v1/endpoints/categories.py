from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Dict, Any
from app.core.db import get_db
from app.models.wholesale import AppSetting

router = APIRouter()

@router.get("/", response_model=List[str])
async def get_categories(db: AsyncSession = Depends(get_db)):
    """
    Truy xuất danh sách danh mục sản phẩm sỉ.
    """
    result = await db.execute(select(AppSetting).filter(AppSetting.key == "product_categories"))
    setting = result.scalars().first()
    if not setting:
        return ["Túi vận chuyển", "Ăn uống du lịch", "Vệ sinh"]
    return setting.value.get("categories", [])

@router.post("/", response_model=Dict[str, Any])
async def save_categories(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Thêm mới hoặc cập nhật danh sách danh mục sản phẩm.
    """
    categories = payload.get("categories")
    if not isinstance(categories, list):
        raise HTTPException(status_code=400, detail="Danh sách categories không hợp lệ.")
        
    result = await db.execute(select(AppSetting).filter(AppSetting.key == "product_categories"))
    setting = result.scalars().first()
    
    # Clone and modify dict to trigger SQLAlchemy JSON change tracking
    if not setting:
        setting = AppSetting(
            key="product_categories",
            value={"categories": categories}
        )
        db.add(setting)
    else:
        setting.value = {"categories": categories}
        
    await db.commit()
    return {"status": "success", "message": "Lưu danh mục thành công."}

@router.get("/policy", response_model=Dict[str, Any])
async def get_policy(db: AsyncSession = Depends(get_db)):
    """
    Truy xuất chính sách hệ thống (admin_policy).
    """
    result = await db.execute(select(AppSetting).filter(AppSetting.key == "admin_policy"))
    setting = result.scalars().first()
    if not setting:
        return {
            "freeShippingThreshold": 5000000,
            "defaultDepositRate": 0.3,
            "maxOperatorDiscountRate": 0.08,
            "requireManagerApprovalAbove": 500000
        }
    val = setting.value
    return {
        "freeShippingThreshold": val.get("freeShippingThreshold", 5000000),
        "defaultDepositRate": val.get("defaultDepositRate", 0.3),
        "maxOperatorDiscountRate": val.get("maxOperatorDiscountRate", 0.08),
        "requireManagerApprovalAbove": val.get("requireManagerApprovalAbove", 500000)
    }

@router.post("/policy", response_model=Dict[str, Any])
async def save_policy(payload: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    """
    Cập nhật chính sách hệ thống (admin_policy).
    """
    result = await db.execute(select(AppSetting).filter(AppSetting.key == "admin_policy"))
    setting = result.scalars().first()
    
    policy_data = {
        "freeShippingThreshold": payload.get("freeShippingThreshold", 5000000),
        "defaultDepositRate": payload.get("defaultDepositRate", 0.3),
        "maxOperatorDiscountRate": payload.get("maxOperatorDiscountRate", 0.08),
        "requireManagerApprovalAbove": payload.get("requireManagerApprovalAbove", 500000)
    }
    
    if not setting:
        setting = AppSetting(
            key="admin_policy",
            value=policy_data
        )
        db.add(setting)
    else:
        setting.value = policy_data
        
    await db.commit()
    return {"status": "success", "message": "Lưu chính sách thành công.", "policy": policy_data}
