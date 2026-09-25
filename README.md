# Vault: Fault-Tolerant Distributed Object Storage System

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg)](https://fastapi.tiangolo.com/)
[![SQLite](https://img.shields.io/badge/SQLite-WAL_Mode-003B57.svg)](https://www.sqlite.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![Tests](https://img.shields.io/badge/tests-61%20passed-brightgreen.svg)]()

**Vault** is a resilient, fault-tolerant distributed object storage system implemented with a Python FastAPI backend, SQLite metadata management (WAL mode), local filesystem storage nodes, and a modern **React + Vite + Three.js + Tailwind CSS** dark-first frontend dashboard.

Vault guarantees strong consistency, high availability, silent bit-rot detection, automated self-healing, quorum math enforcement, split-brain write fencing, and background storage rebalancing.

---

## 🎨 Frontend Dashboard (React + Three.js + Tailwind CSS)

Vault includes a production-grade infrastructure dashboard located in [`vault-frontend/`](file:///d:/promptothon/vault-frontend/):

- **3D Hero Visualization**: Interactive Three.js / React Three Fiber cluster topology visualization showcasing real-time data stream particle animations between the Vault Coordinator and Storage Nodes.
- **Object Browser & Drag-and-Drop Upload**: Upload modal with stage-by-stage progress tracking (`Uploading` $\rightarrow$ `Replicating` $\rightarrow$ `Verifying` $\rightarrow$ `Completed`), streaming downloads, and SHA-256 integrity audits.
- **Node Management**: Storage node cards (`Node 1` .. `Node 5`), disk capacity gauges, latency probes, power toggles (`Simulate Offline` / `Bring Online`), and slow node latency injection.
- **HRW Replication Visualizer**: Interactive Highest Random Weight (HRW) hashing score ranking calculator and $W + R > N$ quorum math auditor.
- **Self-Healing & Integrity Center**: One-click cluster scrubbing (`POST /admin/scrub`) and replica repair execution (`POST /admin/repair`).
- **Storage Rebalancing Dashboard**: Before-vs-after capacity distribution comparison and automated byte migration (`POST /admin/rebalance`).
- **Failure Simulation Lab**: Interactive testing lab for node outages, split-brain write fencing (`HTTP 503`), disk corruption, and latency delays with Framer Motion reaction sequence pipelines.
- **Real-Time Terminal Logs**: Monospace log stream console with level filters (`ALL`, `INFO`, `WARNING`, `ERROR`, `SUCCESS`).

---

## 🏛️ System Architecture

Vault organizes storage nodes into a unified distributed cluster managed via strict consistent hashing and centralized SQLite WAL metadata transaction tracking.

```
                               ┌────────────────────────┐
                               │   API Gateway / Client │
                               └───────────┬────────────┘
                                           │
                                           ▼
                               ┌────────────────────────┐
                               │   FastAPI App Engine   │
                               └─────┬────────────┬─────┘
                                     │            │
             ┌───────────────────────┘            └───────────────────────┐
             ▼                                                            ▼
┌─────────────────────────┐                                  ┌─────────────────────────┐
│ Metadata Catalog DB     │                                  │ Node & Lock Managers    │
│ (SQLite WAL Mode)       │                                  │ (AsyncRWLock Engine)    │
└─────────────────────────┘                                  └─────────────────────────┘
             │                                                            │
             └───────────────────────────┬────────────────────────────────┘
                                         │
     ┌───────────────────┬───────────────┼───────────────┬───────────────────┐
     ▼                   ▼               ▼               ▼                   ▼
┌─────────┐         ┌─────────┐     ┌─────────┐     ┌─────────┐         ┌─────────┐
│ Node 1  │         │ Node 2  │     │ Node 3  │     │ Node 4  │         │ Node 5  │
│ (FS)    │         │ (FS)    │     │ (FS)    │     │ (FS)    │         │ (FS)    │
└─────────┘         └─────────┘     └─────────┘     └─────────┘         └─────────┘
```

---

## ✨ Key Features & Capabilities

### 1. Consistent Replica Placement (HRW Hashing)
- Uses **Highest Random Weight (HRW) / Rendezvous Hashing** to deterministically map object keys to target storage nodes.
- Guarantees minimal key reassignment when nodes join or leave the cluster ($O(1)$ node churn cost).

### 2. Immutable Version Catalog & Sidecar Metadata
- Implements an **SQLite WAL-mode metadata database** (`metadata.db`) tracking object keys, current version numbers, SHA-256 digests, sizes, and replica locations.
- Storage nodes persist object binaries (`{key}.v{ver}`) paired with JSON sidecar files (`{key}.v{ver}.vmeta`) containing immutable per-version payload hashes.

### 3. SHA-256 Bit-Rot Detection & Read Failover
- Computes SHA-256 checksums on streaming object uploads.
- Validates payload hashes on read operations. If bit-rot is detected on a primary node, Vault silently fails over to secondary healthy replicas and logs corruption for repair.

### 4. Failure Detection & Dynamic Cluster Probing
- Periodically probes storage nodes to track status (`healthy`, `degraded`, `unreachable`, `partitioned`).
- Computes response latency metrics and automatically routes read operations away from slow or failing nodes.

### 5. Automated Self-Healing & Replica Repair
- **Background Scrubbing**: Scans storage nodes via `/admin/scrub` to locate corrupted or missing file replicas.
- **Self-Healing Engine**: `/admin/repair` restores damaged replicas from healthy peer nodes or allocates spare nodes when current replicas are permanently lost.

### 6. Fine-Grained Per-Key Concurrency Control
- `LockManager` provides asynchronous Read/Write locking (`AsyncRWLock`) per object key.
- Supports concurrent reader operations while ensuring exclusive writer access with writer priority, timeouts, and stale lock eviction.

### 7. Quorum Math ($W + R > N$) & Inline Read Repair
- Validates strict quorum math ($W + R > N$, where default $N=3, W=2, R=2$).
- Enforces write quorums during uploads.
- Performs **Inline Read Repair**: when version divergence or stale replicas are detected during GET requests, clean content is automatically synchronized back to out-of-date nodes.

### 8. Split-Brain Fencing & Network Partition Resynchronization
- Simulates network partitions dividing the cluster into isolated node groups.
- Enforces **Split-Brain Fencing**: rejects write requests with HTTP 503 (`SplitBrainFencingError`) when the connected node set falls below majority quorum ($N/2 + 1 = 3$ for a 5-node cluster).
- `POST /admin/partition/heal` automatically reconnects nodes and triggers cluster-wide version resynchronization.

### 9. Storage Capacity Tracking & Background Rebalancing
- Monitors disk usage and byte distribution across all storage nodes.
- Calculates cluster mean byte usage and imbalance threshold (`max(100, mean_bytes * 0.15)`).
- Safely migrates object replicas from over-utilized nodes to under-utilized nodes without data loss.

---

## 📂 Directory Structure

```
.
├── app/
│   ├── main.py                     # FastAPI application entrypoint & middleware
│   ├── config.py                   # Pydantic environment configuration
│   ├── core/
│   │   ├── concurrency.py          # Per-key AsyncRWLock manager
│   │   ├── consistency.py          # Quorum math & inline read-repair manager
│   │   ├── failure_detector.py     # Heartbeat probing & latency metrics
│   │   ├── integrity.py            # SHA-256 bit-rot detector & scrub engine
│   │   ├── metadata.py             # SQLite WAL metadata database interface
│   │   ├── partition.py            # Split-brain simulation & write fencing
│   │   ├── rebalance.py            # Storage capacity tracking & rebalancer
│   │   ├── repair.py               # Self-healing & replica repair manager
│   │   └── replication.py          # HRW Rendezvous Hashing engine
│   └── storage/
│       └── storage_manager.py      # Node filesystem interface & sidecars
├── tests/
│   ├── test_concurrency.py         # Lock isolation & timeout unit tests
│   ├── test_corruption.py          # Bit-rot detection & failover tests
│   ├── test_failure.py             # Failure detection & status tests
│   ├── test_integration.py         # End-to-end lifecycle & stress tests
│   ├── test_objects.py             # Basic CRUD & path validation tests
│   ├── test_partition.py           # Split-brain fencing & resync tests
│   ├── test_quorum.py              # Quorum math & inline read repair tests
│   ├── test_rebalance.py           # Storage capacity & migration tests
│   ├── test_repair.py              # Self-healing & spare allocation tests
│   ├── test_replication.py         # HRW hash distribution tests
│   └── test_versioning.py          # Catalog immutability & sidecar tests
├── Dockerfile                      # Production container spec
├── docker-compose.yml              # Cluster service orchestration
├── requirements.txt                # Python package dependencies
└── README.md                       # Complete documentation
```

---

## 🚀 API Endpoints Reference

### 📦 Object Storage API
| Method | Path | Description |
| :--- | :--- | :--- |
| `PUT` | `/objects/{key:path}` | Upload object payload (supports versioning & quorum write) |
| `GET` | `/objects/{key:path}` | Download latest object payload (supports failover & read repair) |
| `DELETE` | `/objects/{key:path}` | Soft/hard delete object metadata and replicas |
| `GET` | `/objects/{key:path}/versions` | List all historical version records for an object |
| `GET` | `/objects/{key:path}/metadata` | Fetch active version metadata & replica locations |
| `GET` | `/objects/{key:path}/verify` | Verify SHA-256 integrity of object replicas across all nodes |

### 🛠️ Cluster & Administration API
| Method | Path | Description |
| :--- | :--- | :--- |
| `GET` | `/admin/nodes` | List status, storage usage, and health of all cluster nodes |
| `POST` | `/admin/nodes/{node}/status` | Update node status (`healthy`, `degraded`, `unreachable`) |
| `POST` | `/admin/nodes/{node}/corrupt/{key:path}` | Inject bit-rot corruption into a node replica for testing |
| `GET` | `/admin/scrub` | Perform full cluster integrity scrub to detect corrupted/missing files |
| `POST` | `/admin/repair` | Trigger automated cluster self-healing and replica repair |
| `GET` | `/admin/quorum/validate` | Validate cluster $W + R > N$ quorum formula math |
| `POST` | `/admin/partition/simulate` | Simulate split-brain partition dividing cluster into isolated sets |
| `GET` | `/admin/partition/status` | Query current network partition topology & write fencing status |
| `POST` | `/admin/partition/heal` | Heal network partitions and trigger automated version resynchronization |
| `GET` | `/admin/rebalance/status` | Fetch storage node byte variance & imbalance metrics |
| `POST` | `/admin/rebalance` | Trigger background storage rebalancing across nodes |

---

## 💻 Local Setup & Execution Guide

### Prerequisites
- Python 3.11+
- PowerShell / Bash CLI

### 1. Environment Setup
```powershell
# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows PowerShell)
.\.venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### 2. Running Test Suite
Execute the comprehensive 61-test verification suite:
```powershell
.\.venv\Scripts\pytest.exe -v
```

### 3. Launching Vault Server Locally
```powershell
.\.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🌐 Cloud Deployment Options

### Option A: Render Deployment (Recommended for Persistent Data)
Render supports persistent disks, making it the ideal host for Vault's SQLite WAL database and node storage directories.

1. **Push to GitHub**: Push your repository to GitHub.
2. **Deploy via Render Blueprint**:
   - Go to [Render Dashboard](https://dashboard.render.com/) -> **New** -> **Blueprint**.
   - Connect your GitHub repository containing `render.yaml`.
   - Render automatically provisions:
     - Python 3.11 Uvicorn Web Service bound to `$PORT`.
     - 1GB Persistent Disk mounted at `/var/data` for `metadata.db` and storage nodes.

---

### Option B: Vercel Serverless Deployment
Vercel deploys FastAPI as an asynchronous Serverless Function via `@vercel/python`.

> [!NOTE]
> Vercel functions execute in an ephemeral serverless environment. On Vercel, Vault automatically configures its storage base to `/tmp/storage`.

1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```
2. **Deploy via CLI**:
   ```bash
   vercel
   ```
3. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

---

## 🐳 Docker Deployment Guide

### Using Docker Compose (Recommended)
```bash
# Build image and start Vault cluster service
docker-compose up -d --build

# View container logs
docker-compose logs -f

# Check container health status
docker-compose ps

# Stop Vault container
docker-compose down
```

### Using Standalone Docker
```bash
# Build Docker image
docker build -t vault-storage:latest .

# Run container with mounted storage volume
docker run -d \
  --name vault_server \
  -p 8000:8000 \
  -v vault_data:/app/storage \
  vault-storage:latest
```

---

## 🧪 Quickstart & Sample Operations

### 1. Upload Object
```bash
curl -X PUT "http://localhost:8000/objects/docs/report.pdf" \
     -H "Content-Type: application/octet-stream" \
     --data-binary "@report.pdf"
```

### 2. Download Object
```bash
curl -s "http://localhost:8000/objects/docs/report.pdf" --output downloaded_report.pdf
```

### 3. Query Object Metadata
```bash
curl -s "http://localhost:8000/objects/docs/report.pdf/metadata" | jq .
```

### 4. Verify Integrity Across Replicas
```bash
curl -s "http://localhost:8000/objects/docs/report.pdf/verify" | jq .
```

### 5. Simulate Bit-Rot & Self-Heal
```bash
# Inject corruption on node1
curl -X POST "http://localhost:8000/admin/nodes/node1/corrupt/docs/report.pdf"

# Perform self-healing repair
curl -X POST "http://localhost:8000/admin/repair" | jq .
```

### 6. Trigger Storage Rebalancing
```bash
curl -X POST "http://localhost:8000/admin/rebalance" | jq .
```

---

## 📜 License
This project is licensed under the MIT License - see the LICENSE file for details.
