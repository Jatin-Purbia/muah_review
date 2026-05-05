# Project Docs

This project keeps a single README in `docs/`.

## What to read

- [architecture.md](architecture.md): system structure, backend/frontend split, and service layout
- [usage.md](usage.md): how to run the backend and frontend locally

## Quick Run

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Runs on `http://localhost:4500`.

### Frontend

```bash
cd frontend
npm install
ng serve
```

Runs on `http://localhost:4200`.

## Main App Flow

- Submit reviews through the frontend
- Backend processes them through the moderation pipeline
- Super Admin manages moderation
- Seller Portal shows seller-facing review visibility and feedback context
