from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Any
import sqlite3, uuid, json, os, requests, base64
from dotenv import load_dotenv

load_dotenv()
XENDIT_SECRET_KEY = os.getenv("XENDIT_SECRET_KEY", "").strip()
router = APIRouter()
DB_NAME = "memora_local.db"

def init_db():
    conn = sqlite3.connect(DB_NAME)
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, username TEXT, email TEXT UNIQUE, password_hash TEXT, is_premium BOOLEAN DEFAULT 0)")
    c.execute("CREATE TABLE IF NOT EXISTS transactions (transaction_id TEXT PRIMARY KEY, user_id TEXT, order_id TEXT UNIQUE, gross_amount REAL, payment_type TEXT DEFAULT 'QRIS', status TEXT DEFAULT 'PENDING', webhook_log TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS simulation_history (history_id TEXT PRIMARY KEY, user_id TEXT, algorithm TEXT, total_memory INTEGER, fragmentation_rate REAL, simulation_state TEXT)")
    c.execute("INSERT OR IGNORE INTO users VALUES ('user-test-123', 'hafidz_tester', 'hafidz@memora.test', 'dummy', 0)")
    conn.commit()
    conn.close()

init_db()

class SimulationSaveRequest(BaseModel):
    user_id: str = "user-test-123"
    algorithm: str = "Next-Fit"
    total_memory: int = 1000
    fragmentation_rate: float = 12.5
    simulation_state: List[Any] = [{"id": "Buku_A", "size": 200, "is_free": False}]

class CreatePaymentRequest(BaseModel):
    user_id: str = "user-test-123"
    gross_amount: float = 15000.0

class WebhookPayload(BaseModel):
    external_id: str
    status: str = "PAID"

@router.post("/simulations/save")
async def save_simulation(data: SimulationSaveRequest):
    hid = str(uuid.uuid4())
    conn = sqlite3.connect(DB_NAME)
    conn.execute("INSERT INTO simulation_history VALUES (?, ?, ?, ?, ?, ?)", (hid, data.user_id, data.algorithm, data.total_memory, data.fragmentation_rate, json.dumps(data.simulation_state)))
    conn.commit()
    conn.close()
    return {"status": "success", "history_id": hid}

@router.get("/users/{user_id}/status")
async def get_user_status(user_id: str):
    conn = sqlite3.connect(DB_NAME)
    row = conn.execute("SELECT username, is_premium FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    return {"user_id": user_id, "username": row[0], "is_premium": bool(row[1])}

@router.post("/payment/create-qris")
async def create_qris(req: CreatePaymentRequest):
    if not XENDIT_SECRET_KEY:
        return {"status": "ERROR", "pesan": "XENDIT_SECRET_KEY belum diisi di file .env"}
    
    tid = str(uuid.uuid4())
    oid = f"MEMORA-{uuid.uuid4().hex[:8].upper()}"
    
    conn = sqlite3.connect(DB_NAME)
    conn.execute("INSERT OR IGNORE INTO users VALUES (?, ?, ?, 'dummy', 0)", (req.user_id, f"user_{req.user_id}", f"{req.user_id}@memora.test"))
    conn.execute("INSERT INTO transactions (transaction_id, user_id, order_id, gross_amount, status) VALUES (?, ?, ?, ?, 'PENDING')", (tid, req.user_id, oid, req.gross_amount))
    conn.commit()
    conn.close()
    
    auth = base64.b64encode(f"{XENDIT_SECRET_KEY}:".encode()).decode()
    headers = {"Content-Type": "application/json", "Authorization": f"Basic {auth}"}
    payload = {
        "external_id": oid,
        "amount": int(req.gross_amount),
        "description": "Upgrade Memora Premium (Compaction Mode)",
        "payment_methods": ["QRIS"]
    }
    
    xendit_url = "https://xendit.co"
    r = requests.post(xendit_url, json=payload, headers=headers)
    res_json = r.json()
    
    return {
        "status": "PENDING",
        "order_id": oid,
        "gross_amount": req.gross_amount,
        "qris_url": res_json.get("invoice_url", ""),
        "xendit_raw": res_json
    }

@router.post("/payment/webhook")
async def payment_webhook(payload: WebhookPayload):
    conn = sqlite3.connect(DB_NAME)
    tx = conn.execute("SELECT user_id FROM transactions WHERE order_id = ?", (payload.external_id,)).fetchone()
    if not tx:
        conn.close()
        raise HTTPException(status_code=404, detail="Order ID tidak ditemukan")
    if payload.status in ["PAID", "SETTLED"]:
        conn.execute("UPDATE transactions SET status = 'SETTLEMENT', webhook_log = ? WHERE order_id = ?", (payload.model_dump_json(), payload.external_id))
        conn.execute("UPDATE users SET is_premium = 1 WHERE user_id = ?", (tx[0],))
        conn.commit()
        conn.close()
        return {"status": "ok", "message": f"Order {payload.external_id} lunas. User {tx[0]} PREMIUM!"}
    conn.close()
    return {"status": "ignored", "message": payload.status}
