import os
import logging
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Literal, Annotated

import jwt
from jwt.exceptions import InvalidTokenError
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Query
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr
from passlib.context import CryptContext


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# Config / DB
# ---------------------------------------------------------------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
JWT_EXPIRE_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "43200"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gudang")

app = FastAPI()
api = APIRouter(prefix="/api")

Role = Literal["admin", "staff"]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(raw: str) -> str:
    return pwd_context.hash(raw[:72])


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return pwd_context.verify(raw[:72], hashed)
    except Exception:
        return False


def make_token(user: dict) -> str:
    n = now_utc()
    payload = {
        "sub": user["id"],
        "role": user["role"],
        "iat": n,
        "exp": n + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class LoginBody(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Role
    active: bool


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class StaffCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = ""


class SupplierOut(BaseModel):
    id: str
    name: str
    phone: str = ""


class ProductOut(BaseModel):
    id: str
    barcode: str
    name: str
    stock: int = 0
    cost: float = 0.0
    price: float = 0.0
    branch_stock: Optional[int] = None


class ProductCreate(BaseModel):
    barcode: str
    name: str
    price: float = 0.0


class ReceiptItemIn(BaseModel):
    barcode: str
    name: str
    qty: int = 1


class ReceiptCreate(BaseModel):
    supplier_id: str
    branch_id: Optional[str] = None
    items: List[ReceiptItemIn]


class ApproveItem(BaseModel):
    barcode: str
    unit_cost: float = 0.0


class ApproveBody(BaseModel):
    items: List[ApproveItem]


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
def clean_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", u["email"]),
        "role": u["role"],
        "active": u.get("active", True),
    }


async def current_user(token: Annotated[str, Depends(oauth2)]) -> dict:
    err = HTTPException(status_code=401, detail="Sesi tidak valid atau kadaluarsa")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        uid = payload.get("sub")
    except InvalidTokenError:
        raise err
    if not uid:
        raise err
    u = await db.users.find_one({"id": uid, "active": True})
    if not u:
        raise err
    return u


async def admin_only(u: dict = Depends(current_user)) -> dict:
    if u["role"] != "admin":
        raise HTTPException(status_code=403, detail="Butuh akses admin")
    return u


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@api.post("/auth/login", response_model=TokenOut)
async def login(body: LoginBody):
    u = await db.users.find_one({"email": body.email.lower()})
    if not u or not u.get("active", True) or not verify_password(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    return TokenOut(access_token=make_token(u), user=UserOut(**clean_user(u)))


@api.get("/auth/me", response_model=UserOut)
async def me(u: dict = Depends(current_user)):
    return UserOut(**clean_user(u))


# ---------------------------------------------------------------------------
# Staff management (admin)
# ---------------------------------------------------------------------------
@api.get("/staff", response_model=List[UserOut])
async def list_staff(_: dict = Depends(admin_only)):
    out = []
    async for u in db.users.find({"role": "staff"}).sort("created_at", -1).limit(500):
        out.append(UserOut(**clean_user(u)))
    return out


@api.post("/staff", response_model=UserOut, status_code=201)
async def create_staff(body: StaffCreate, _: dict = Depends(admin_only)):
    email = body.email.lower()
    if len(body.password) < 4:
        raise HTTPException(422, "Password minimal 4 karakter")
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email sudah terdaftar")
    doc = {
        "id": new_id(),
        "name": body.name,
        "email": email,
        "password_hash": hash_password(body.password),
        "role": "staff",
        "active": True,
        "created_at": now_utc(),
    }
    await db.users.insert_one(doc)
    return UserOut(**clean_user(doc))


@api.patch("/staff/{user_id}/toggle", response_model=UserOut)
async def toggle_staff(user_id: str, _: dict = Depends(admin_only)):
    u = await db.users.find_one({"id": user_id, "role": "staff"})
    if not u:
        raise HTTPException(404, "Staf tidak ditemukan")
    new_active = not u.get("active", True)
    await db.users.update_one({"id": user_id}, {"$set": {"active": new_active}})
    u["active"] = new_active
    return UserOut(**clean_user(u))


# ---------------------------------------------------------------------------
# Suppliers
# ---------------------------------------------------------------------------
@api.get("/suppliers", response_model=List[SupplierOut])
async def list_suppliers(u: dict = Depends(current_user)):
    out = []
    async for s in db.suppliers.find({"deleted_at": None}, {"id": 1, "name": 1, "phone": 1}).sort("name", 1).limit(1000):
        out.append(SupplierOut(id=s["id"], name=s["name"], phone=s.get("phone", "")))
    return out


@api.post("/suppliers", response_model=SupplierOut, status_code=201)
async def create_supplier(body: SupplierCreate, u: dict = Depends(current_user)):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Nama supplier wajib diisi")
    existing = await db.suppliers.find_one({"name": name, "deleted_at": None})
    if existing:
        return SupplierOut(id=existing["id"], name=existing["name"], phone=existing.get("phone", ""))
    doc = {
        "id": new_id(),
        "name": name,
        "phone": body.phone or "",
        "deleted_at": None,
        "created_at": now_utc(),
    }
    await db.suppliers.insert_one(doc)
    return SupplierOut(id=doc["id"], name=doc["name"], phone=doc["phone"])


# ---------------------------------------------------------------------------
# Products (shared POS catalog)
# ---------------------------------------------------------------------------
def product_out(p: dict) -> ProductOut:
    return ProductOut(
        id=p["id"],
        barcode=p["barcode"],
        name=p["name"],
        stock=p.get("stock", 0),
        cost=p.get("cost", 0.0),
        price=p.get("price", 0.0),
    )


@api.get("/products", response_model=List[ProductOut])
async def list_products(u: dict = Depends(current_user), q: Optional[str] = Query(None), branch_id: Optional[str] = Query(None)):
    query = {"deleted_at": None}
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"barcode": {"$regex": q, "$options": "i"}},
        ]
    smap = await branch_stock_map(branch_id) if branch_id else None
    out = []
    async for p in db.products.find(query).sort("name", 1).limit(500):
        po = product_out(p)
        if smap is not None:
            po.branch_stock = smap.get(p["id"], 0)
        out.append(po)
    return out


@api.get("/products/barcode/{barcode}", response_model=ProductOut)
async def get_by_barcode(barcode: str, u: dict = Depends(current_user), branch_id: Optional[str] = Query(None)):
    p = await db.products.find_one({"barcode": barcode, "deleted_at": None})
    if not p:
        raise HTTPException(404, "Produk tidak ditemukan")
    po = product_out(p)
    if branch_id:
        po.branch_stock = await get_branch_stock(p["id"], branch_id)
    return po


@api.get("/products/barcode/{barcode}/last-cost")
async def last_cost(barcode: str, u: dict = Depends(current_user)):
    """Pull previous purchase price for a barcode from purchase history."""
    h = await db.purchase_history.find_one(
        {"barcode": barcode}, sort=[("purchased_at", -1)]
    )
    p = await db.products.find_one({"barcode": barcode, "deleted_at": None})
    return {
        "barcode": barcode,
        "last_cost": h.get("unit_cost", 0.0) if h else (p.get("cost", 0.0) if p else 0.0),
        "last_supplier": h.get("supplier_name", "") if h else "",
        "last_purchased_at": h["purchased_at"].isoformat() if h else None,
        "found": h is not None,
    }


@api.post("/products", response_model=ProductOut, status_code=201)
async def create_product(body: ProductCreate, u: dict = Depends(current_user)):
    existing = await db.products.find_one({"barcode": body.barcode, "deleted_at": None})
    if existing:
        return product_out(existing)
    doc = {
        "id": new_id(),
        "barcode": body.barcode,
        "name": body.name.strip() or body.barcode,
        "stock": 0,
        "cost": 0.0,
        "price": body.price,
        "deleted_at": None,
        "created_at": now_utc(),
        "updated_at": now_utc(),
    }
    await db.products.insert_one(doc)
    return product_out(doc)


# ---------------------------------------------------------------------------
# Receipts (goods receiving)
# ---------------------------------------------------------------------------
def receipt_out(r: dict) -> dict:
    return {
        "id": r["id"],
        "supplier_id": r["supplier_id"],
        "supplier_name": r["supplier_name"],
        "branch_id": r.get("branch_id", ""),
        "branch_name": r.get("branch_name", ""),
        "status": r["status"],
        "items": r["items"],
        "created_by_name": r.get("created_by_name", ""),
        "created_at": r["created_at"].isoformat() if isinstance(r.get("created_at"), datetime) else r.get("created_at"),
        "submitted_at": r["submitted_at"].isoformat() if isinstance(r.get("submitted_at"), datetime) else r.get("submitted_at"),
        "approved_at": r["approved_at"].isoformat() if isinstance(r.get("approved_at"), datetime) else r.get("approved_at"),
        "approved_by_name": r.get("approved_by_name", ""),
        "total_qty": sum(i.get("qty", 0) for i in r["items"]),
        "total_cost": r.get("total_cost", 0.0),
    }


@api.post("/receipts", status_code=201)
async def create_receipt(body: ReceiptCreate, u: dict = Depends(current_user)):
    supplier = await db.suppliers.find_one({"id": body.supplier_id, "deleted_at": None})
    if not supplier:
        raise HTTPException(404, "Supplier tidak ditemukan")
    if not body.items:
        raise HTTPException(422, "Belum ada item yang di-scan")
    branch = await resolve_branch(body.branch_id)

    items = []
    for it in body.items:
        p = await db.products.find_one({"barcode": it.barcode, "deleted_at": None})
        if not p:
            # auto-create product in POS catalog
            p = {
                "id": new_id(),
                "barcode": it.barcode,
                "name": it.name.strip() or it.barcode,
                "stock": 0,
                "cost": 0.0,
                "price": 0.0,
                "deleted_at": None,
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }
            await db.products.insert_one(p)
        # last cost for reference in audit
        h = await db.purchase_history.find_one({"barcode": it.barcode}, sort=[("purchased_at", -1)])
        last = h.get("unit_cost", 0.0) if h else p.get("cost", 0.0)
        items.append({
            "product_id": p["id"],
            "barcode": it.barcode,
            "name": p["name"],
            "qty": it.qty,
            "unit_cost": last,
            "last_cost": last,
        })

    doc = {
        "id": new_id(),
        "supplier_id": supplier["id"],
        "supplier_name": supplier["name"],
        "branch_id": branch["id"],
        "branch_name": branch["name"],
        "status": "pending_audit",
        "items": items,
        "created_by": u["id"],
        "created_by_name": u.get("name", u["email"]),
        "created_at": now_utc(),
        "submitted_at": now_utc(),
        "approved_at": None,
        "approved_by": None,
        "approved_by_name": None,
        "total_cost": 0.0,
    }
    await db.receipts.insert_one(doc)
    return receipt_out(doc)


@api.get("/receipts")
async def list_receipts(u: dict = Depends(current_user), status: Optional[str] = Query(None)):
    query = {}
    if status:
        query["status"] = status
    if u["role"] != "admin":
        query["created_by"] = u["id"]
    out = []
    async for r in db.receipts.find(query).sort("submitted_at", -1).limit(200):
        out.append(receipt_out(r))
    return out


@api.get("/receipts/{receipt_id}")
async def get_receipt(receipt_id: str, u: dict = Depends(current_user)):
    r = await db.receipts.find_one({"id": receipt_id})
    if not r:
        raise HTTPException(404, "Penerimaan tidak ditemukan")
    return receipt_out(r)


@api.post("/receipts/{receipt_id}/approve")
async def approve_receipt(receipt_id: str, body: ApproveBody, u: dict = Depends(admin_only)):
    r = await db.receipts.find_one({"id": receipt_id})
    if not r:
        raise HTTPException(404, "Penerimaan tidak ditemukan")
    if r["status"] == "approved":
        raise HTTPException(400, "Penerimaan sudah disetujui")

    cost_map = {i.barcode: i.unit_cost for i in body.items}
    total_cost = 0.0
    updated_items = []
    for it in r["items"]:
        unit_cost = cost_map.get(it["barcode"], it.get("unit_cost", 0.0))
        line_total = unit_cost * it["qty"]
        total_cost += line_total
        it["unit_cost"] = unit_cost
        updated_items.append(it)
        # sync to POS: update last cost + increment branch stock via ledger
        await db.products.update_one(
            {"id": it["product_id"]},
            {"$set": {"cost": unit_cost, "updated_at": now_utc()}},
        )
        await record_movement(
            product_id=it["product_id"], barcode=it["barcode"], name=it["name"],
            branch_id=r.get("branch_id", ""), branch_name=r.get("branch_name", ""),
            delta=it["qty"], mtype="receive", ref_id=r["id"], ref_type="receipt",
            note=f"Terima dari {r['supplier_name']}", user=u,
        )
        # record purchase history
        await db.purchase_history.insert_one({
            "id": new_id(),
            "product_id": it["product_id"],
            "barcode": it["barcode"],
            "supplier_id": r["supplier_id"],
            "supplier_name": r["supplier_name"],
            "qty": it["qty"],
            "unit_cost": unit_cost,
            "receipt_id": r["id"],
            "purchased_at": now_utc(),
        })

    await db.receipts.update_one(
        {"id": receipt_id},
        {"$set": {
            "status": "approved",
            "items": updated_items,
            "total_cost": total_cost,
            "approved_at": now_utc(),
            "approved_by": u["id"],
            "approved_by_name": u.get("name", u["email"]),
        }},
    )
    r = await db.receipts.find_one({"id": receipt_id})
    return receipt_out(r)


# ---------------------------------------------------------------------------
# POS connection endpoint (shared inventory read)
# ---------------------------------------------------------------------------
@api.get("/pos/inventory")
async def pos_inventory(u: dict = Depends(current_user)):
    """Live inventory the POS reads: stock and last purchase cost per product."""
    out = []
    async for p in db.products.find({"deleted_at": None}, {"barcode": 1, "name": 1, "stock": 1, "cost": 1, "price": 1}).sort("name", 1).limit(1000):
        out.append({
            "barcode": p["barcode"],
            "name": p["name"],
            "stock": p.get("stock", 0),
            "cost": p.get("cost", 0.0),
            "price": p.get("price", 0.0),
        })
    return {"count": len(out), "items": out}


# ---------------------------------------------------------------------------
# Branches + stock ledger (per-branch stock, movements)
# ---------------------------------------------------------------------------
class BranchCreate(BaseModel):
    name: str
    code: Optional[str] = ""
    address: Optional[str] = ""


class BranchPatch(BaseModel):
    name: Optional[str] = None
    active: Optional[bool] = None


class TransferItemIn(BaseModel):
    barcode: str
    name: str
    qty: int = 1


class TransferCreate(BaseModel):
    from_branch_id: str
    to_branch_id: str
    items: List[TransferItemIn]
    note: Optional[str] = ""


class OpnameItemIn(BaseModel):
    barcode: str
    name: str
    physical_qty: int = 0


class OpnameCreate(BaseModel):
    branch_id: str
    items: List[OpnameItemIn]
    note: Optional[str] = ""


class IssueItemIn(BaseModel):
    barcode: str
    name: str
    qty: int = 1


class IssueCreate(BaseModel):
    branch_id: str
    reason: str
    items: List[IssueItemIn]
    note: Optional[str] = ""


def branch_out(b: dict) -> dict:
    return {
        "id": b["id"],
        "name": b["name"],
        "code": b.get("code", ""),
        "address": b.get("address", ""),
        "is_main": b.get("is_main", False),
        "active": b.get("active", True),
    }


async def get_main_branch() -> Optional[dict]:
    return (
        await db.branches.find_one({"is_main": True, "deleted_at": None})
        or await db.branches.find_one({"deleted_at": None})
    )


async def resolve_branch(branch_id: Optional[str]) -> dict:
    if branch_id:
        b = await db.branches.find_one({"id": branch_id, "deleted_at": None})
        if not b:
            raise HTTPException(404, "Cabang tidak ditemukan")
        return b
    b = await get_main_branch()
    if not b:
        raise HTTPException(400, "Belum ada cabang")
    return b


async def resolve_product(barcode: str, name: str) -> dict:
    p = await db.products.find_one({"barcode": barcode, "deleted_at": None})
    if p:
        return p
    p = {
        "id": new_id(), "barcode": barcode, "name": (name or barcode).strip(),
        "stock": 0, "cost": 0.0, "price": 0.0, "deleted_at": None,
        "created_at": now_utc(), "updated_at": now_utc(),
    }
    await db.products.insert_one(p)
    return p


async def get_branch_stock(product_id: str, branch_id: str) -> int:
    lvl = await db.stock_levels.find_one({"product_id": product_id, "branch_id": branch_id})
    return lvl.get("stock", 0) if lvl else 0


async def branch_stock_map(branch_id: str) -> dict:
    out = {}
    async for lvl in db.stock_levels.find({"branch_id": branch_id}):
        out[lvl["product_id"]] = lvl.get("stock", 0)
    return out


async def record_movement(*, product_id, barcode, name, branch_id, branch_name,
                          delta, mtype, ref_id=None, ref_type=None, note="", user=None):
    await db.stock_levels.update_one(
        {"product_id": product_id, "branch_id": branch_id},
        {"$inc": {"stock": delta},
         "$setOnInsert": {"id": new_id(), "product_id": product_id, "branch_id": branch_id}},
        upsert=True,
    )
    await db.products.update_one(
        {"id": product_id}, {"$inc": {"stock": delta}, "$set": {"updated_at": now_utc()}}
    )
    await db.movements.insert_one({
        "id": new_id(), "product_id": product_id, "barcode": barcode, "name": name,
        "branch_id": branch_id, "branch_name": branch_name, "qty": delta, "type": mtype,
        "ref_id": ref_id, "ref_type": ref_type, "note": note,
        "user_name": (user or {}).get("name", "") if isinstance(user, dict) else "",
        "created_at": now_utc(),
    })


@api.get("/branches")
async def list_branches(u: dict = Depends(current_user)):
    out = []
    async for b in db.branches.find({"deleted_at": None}).sort("name", 1):
        out.append(branch_out(b))
    return out


@api.post("/branches", status_code=201)
async def create_branch(body: BranchCreate, _: dict = Depends(admin_only)):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Nama cabang wajib diisi")
    doc = {
        "id": new_id(), "name": name, "code": (body.code or "").strip(),
        "address": (body.address or "").strip(), "is_main": False, "active": True,
        "deleted_at": None, "created_at": now_utc(),
    }
    await db.branches.insert_one(doc)
    return branch_out(doc)


@api.patch("/branches/{branch_id}")
async def patch_branch(branch_id: str, body: BranchPatch, _: dict = Depends(admin_only)):
    b = await db.branches.find_one({"id": branch_id, "deleted_at": None})
    if not b:
        raise HTTPException(404, "Cabang tidak ditemukan")
    upd = {}
    if body.name is not None:
        upd["name"] = body.name.strip()
    if body.active is not None:
        upd["active"] = body.active
    if upd:
        await db.branches.update_one({"id": branch_id}, {"$set": upd})
    b = await db.branches.find_one({"id": branch_id})
    return branch_out(b)


# ---- Transfers -------------------------------------------------------------
def transfer_out(t: dict) -> dict:
    return {
        "id": t["id"],
        "from_branch_id": t["from_branch_id"], "from_branch_name": t["from_branch_name"],
        "to_branch_id": t["to_branch_id"], "to_branch_name": t["to_branch_name"],
        "status": t["status"], "items": t["items"], "note": t.get("note", ""),
        "total_qty": sum(i.get("qty", 0) for i in t["items"]),
        "created_by_name": t.get("created_by_name", ""),
        "created_at": t["created_at"].isoformat() if isinstance(t.get("created_at"), datetime) else t.get("created_at"),
        "received_at": t["received_at"].isoformat() if isinstance(t.get("received_at"), datetime) else t.get("received_at"),
        "received_by_name": t.get("received_by_name", ""),
    }


@api.post("/transfers", status_code=201)
async def create_transfer(body: TransferCreate, u: dict = Depends(current_user)):
    if body.from_branch_id == body.to_branch_id:
        raise HTTPException(422, "Cabang asal dan tujuan harus berbeda")
    src = await resolve_branch(body.from_branch_id)
    dst = await resolve_branch(body.to_branch_id)
    if not body.items:
        raise HTTPException(422, "Belum ada item")

    items = []
    tid = new_id()
    for it in body.items:
        p = await resolve_product(it.barcode, it.name)
        items.append({"product_id": p["id"], "barcode": it.barcode, "name": p["name"], "qty": it.qty})
        # deduct from source immediately
        await record_movement(
            product_id=p["id"], barcode=it.barcode, name=p["name"],
            branch_id=src["id"], branch_name=src["name"], delta=-it.qty,
            mtype="transfer_out", ref_id=tid, ref_type="transfer",
            note=f"Transfer ke {dst['name']}", user=u,
        )
    doc = {
        "id": tid, "from_branch_id": src["id"], "from_branch_name": src["name"],
        "to_branch_id": dst["id"], "to_branch_name": dst["name"], "status": "pending",
        "items": items, "note": body.note or "", "created_by": u["id"],
        "created_by_name": u.get("name", u["email"]), "created_at": now_utc(),
        "received_at": None, "received_by": None, "received_by_name": None,
    }
    await db.transfers.insert_one(doc)
    return transfer_out(doc)


@api.get("/transfers")
async def list_transfers(u: dict = Depends(current_user), status: Optional[str] = Query(None), branch_id: Optional[str] = Query(None)):
    query = {}
    if status:
        query["status"] = status
    if branch_id:
        query["$or"] = [{"from_branch_id": branch_id}, {"to_branch_id": branch_id}]
    out = []
    async for t in db.transfers.find(query).sort("created_at", -1).limit(200):
        out.append(transfer_out(t))
    return out


@api.post("/transfers/{transfer_id}/receive")
async def receive_transfer(transfer_id: str, u: dict = Depends(current_user)):
    t = await db.transfers.find_one({"id": transfer_id})
    if not t:
        raise HTTPException(404, "Transfer tidak ditemukan")
    if t["status"] != "pending":
        raise HTTPException(400, "Transfer sudah diproses")
    for it in t["items"]:
        await record_movement(
            product_id=it["product_id"], barcode=it["barcode"], name=it["name"],
            branch_id=t["to_branch_id"], branch_name=t["to_branch_name"], delta=it["qty"],
            mtype="transfer_in", ref_id=t["id"], ref_type="transfer",
            note=f"Terima dari {t['from_branch_name']}", user=u,
        )
    await db.transfers.update_one({"id": transfer_id}, {"$set": {
        "status": "received", "received_at": now_utc(),
        "received_by": u["id"], "received_by_name": u.get("name", u["email"]),
    }})
    return transfer_out(await db.transfers.find_one({"id": transfer_id}))


@api.post("/transfers/{transfer_id}/cancel")
async def cancel_transfer(transfer_id: str, u: dict = Depends(current_user)):
    t = await db.transfers.find_one({"id": transfer_id})
    if not t:
        raise HTTPException(404, "Transfer tidak ditemukan")
    if t["status"] != "pending":
        raise HTTPException(400, "Transfer sudah diproses")
    for it in t["items"]:
        await record_movement(
            product_id=it["product_id"], barcode=it["barcode"], name=it["name"],
            branch_id=t["from_branch_id"], branch_name=t["from_branch_name"], delta=it["qty"],
            mtype="transfer_in", ref_id=t["id"], ref_type="transfer",
            note="Batal transfer (stok dikembalikan)", user=u,
        )
    await db.transfers.update_one({"id": transfer_id}, {"$set": {"status": "cancelled"}})
    return transfer_out(await db.transfers.find_one({"id": transfer_id}))


# ---- Opname (stock count) --------------------------------------------------
def opname_out(o: dict) -> dict:
    return {
        "id": o["id"], "branch_id": o["branch_id"], "branch_name": o["branch_name"],
        "status": o["status"], "items": o["items"], "note": o.get("note", ""),
        "total_diff": sum(i.get("diff", 0) for i in o["items"]),
        "created_by_name": o.get("created_by_name", ""),
        "created_at": o["created_at"].isoformat() if isinstance(o.get("created_at"), datetime) else o.get("created_at"),
    }


@api.get("/opnames/snapshot")
async def opname_snapshot(u: dict = Depends(current_user), branch_id: str = Query(...)):
    """Current system stock per product for a branch, to prefill an opname."""
    await resolve_branch(branch_id)
    smap = await branch_stock_map(branch_id)
    out = []
    async for p in db.products.find({"deleted_at": None}).sort("name", 1).limit(1000):
        out.append({"barcode": p["barcode"], "name": p["name"], "system_qty": smap.get(p["id"], 0)})
    return {"branch_id": branch_id, "items": out}


@api.post("/opnames", status_code=201)
async def create_opname(body: OpnameCreate, u: dict = Depends(current_user)):
    branch = await resolve_branch(body.branch_id)
    if not body.items:
        raise HTTPException(422, "Belum ada item")
    oid = new_id()
    items = []
    for it in body.items:
        p = await resolve_product(it.barcode, it.name)
        system_qty = await get_branch_stock(p["id"], branch["id"])
        diff = it.physical_qty - system_qty
        items.append({
            "product_id": p["id"], "barcode": it.barcode, "name": p["name"],
            "system_qty": system_qty, "physical_qty": it.physical_qty, "diff": diff,
        })
        if diff != 0:
            await record_movement(
                product_id=p["id"], barcode=it.barcode, name=p["name"],
                branch_id=branch["id"], branch_name=branch["name"], delta=diff,
                mtype="opname", ref_id=oid, ref_type="opname",
                note="Penyesuaian opname", user=u,
            )
    doc = {
        "id": oid, "branch_id": branch["id"], "branch_name": branch["name"],
        "status": "completed", "items": items, "note": body.note or "",
        "created_by": u["id"], "created_by_name": u.get("name", u["email"]),
        "created_at": now_utc(),
    }
    await db.opnames.insert_one(doc)
    return opname_out(doc)


@api.get("/opnames")
async def list_opnames(u: dict = Depends(current_user), branch_id: Optional[str] = Query(None)):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    out = []
    async for o in db.opnames.find(query).sort("created_at", -1).limit(200):
        out.append(opname_out(o))
    return out


# ---- Issues (barang keluar) ------------------------------------------------
def issue_out(i: dict) -> dict:
    return {
        "id": i["id"], "branch_id": i["branch_id"], "branch_name": i["branch_name"],
        "reason": i.get("reason", ""), "items": i["items"], "note": i.get("note", ""),
        "total_qty": sum(x.get("qty", 0) for x in i["items"]),
        "created_by_name": i.get("created_by_name", ""),
        "created_at": i["created_at"].isoformat() if isinstance(i.get("created_at"), datetime) else i.get("created_at"),
    }


@api.post("/issues", status_code=201)
async def create_issue(body: IssueCreate, u: dict = Depends(current_user)):
    branch = await resolve_branch(body.branch_id)
    if not body.items:
        raise HTTPException(422, "Belum ada item")
    iid = new_id()
    items = []
    for it in body.items:
        p = await resolve_product(it.barcode, it.name)
        items.append({"product_id": p["id"], "barcode": it.barcode, "name": p["name"], "qty": it.qty})
        await record_movement(
            product_id=p["id"], barcode=it.barcode, name=p["name"],
            branch_id=branch["id"], branch_name=branch["name"], delta=-it.qty,
            mtype="issue", ref_id=iid, ref_type="issue",
            note=body.reason, user=u,
        )
    doc = {
        "id": iid, "branch_id": branch["id"], "branch_name": branch["name"],
        "reason": body.reason, "items": items, "note": body.note or "",
        "created_by": u["id"], "created_by_name": u.get("name", u["email"]),
        "created_at": now_utc(),
    }
    await db.issues.insert_one(doc)
    return issue_out(doc)


@api.get("/issues")
async def list_issues(u: dict = Depends(current_user), branch_id: Optional[str] = Query(None)):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    out = []
    async for i in db.issues.find(query).sort("created_at", -1).limit(200):
        out.append(issue_out(i))
    return out


# ---- Movement ledger report ------------------------------------------------
@api.get("/movements")
async def list_movements(u: dict = Depends(current_user), branch_id: Optional[str] = Query(None),
                         mtype: Optional[str] = Query(None), limit: int = Query(100)):
    query = {}
    if branch_id:
        query["branch_id"] = branch_id
    if mtype:
        query["type"] = mtype
    out = []
    async for m in db.movements.find(query).sort("created_at", -1).limit(min(limit, 500)):
        out.append({
            "id": m["id"], "barcode": m["barcode"], "name": m["name"],
            "branch_id": m["branch_id"], "branch_name": m.get("branch_name", ""),
            "qty": m["qty"], "type": m["type"], "note": m.get("note", ""),
            "user_name": m.get("user_name", ""),
            "created_at": m["created_at"].isoformat() if isinstance(m.get("created_at"), datetime) else m.get("created_at"),
        })
    return out


@api.get("/")
async def root():
    return {"message": "Gudang PDA API"}


# ---------------------------------------------------------------------------
# Startup: seed admin + demo data
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def seed():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("barcode")
    await db.stock_levels.create_index([("product_id", 1), ("branch_id", 1)])
    await db.movements.create_index([("branch_id", 1), ("created_at", -1)])

    admin_email = os.environ["ADMIN_EMAIL"].lower()
    if not await db.users.find_one({"email": admin_email}):
        await db.users.insert_one({
            "id": new_id(),
            "name": "Administrator",
            "email": admin_email,
            "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]),
            "role": "admin",
            "active": True,
            "created_at": now_utc(),
        })
        logger.info("Seeded admin user %s", admin_email)

    if await db.suppliers.count_documents({}) == 0:
        for nm, ph in [("PT Sumber Makmur", "021-5551234"), ("CV Berkah Jaya", "021-5555678")]:
            await db.suppliers.insert_one({
                "id": new_id(), "name": nm, "phone": ph, "deleted_at": None, "created_at": now_utc()
            })

    if await db.branches.count_documents({}) == 0:
        await db.branches.insert_one({
            "id": new_id(), "name": "Gudang Pusat", "code": "PST", "address": "",
            "is_main": True, "active": True, "deleted_at": None, "created_at": now_utc(),
        })
        await db.branches.insert_one({
            "id": new_id(), "name": "Cabang Selatan", "code": "CBS", "address": "",
            "is_main": False, "active": True, "deleted_at": None, "created_at": now_utc(),
        })

    if await db.products.count_documents({}) == 0:
        demo = [
            ("8991002101234", "Indomie Goreng", 25, 2500, 3000),
            ("8998866200011", "Aqua 600ml", 40, 2000, 3500),
            ("8992761111015", "Teh Botol Sosro", 30, 3000, 4500),
            ("8996001600146", "Kopi Kapal Api Sachet", 100, 1000, 1500),
        ]
        for bc, nm, st, cost, price in demo:
            await db.products.insert_one({
                "id": new_id(), "barcode": bc, "name": nm, "stock": st,
                "cost": float(cost), "price": float(price), "deleted_at": None,
                "created_at": now_utc(), "updated_at": now_utc(),
            })

    # Migrate: seed per-branch stock into the main branch from product totals.
    if await db.stock_levels.count_documents({}) == 0:
        main = await db.branches.find_one({"is_main": True, "deleted_at": None})
        if main:
            async for p in db.products.find({"deleted_at": None}):
                await db.stock_levels.insert_one({
                    "id": new_id(), "product_id": p["id"],
                    "branch_id": main["id"], "stock": p.get("stock", 0),
                })


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
