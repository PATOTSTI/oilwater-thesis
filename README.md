# Oil-Water Thesis Project

A full-stack application for oil-water detection and monitoring system with FastAPI backend and React frontend.

## Project Structure

```
oilwater-thesis/
├── backend/                 # FastAPI backend server
│   ├── main.py
│   ├── requirements.txt    # Python dependencies
│   ├── core/               # Core utilities (logger, response, state, utils)
│   ├── ml/                 # ML models (detector)
│   ├── models/             # Data models (schemas)
│   └── routes/             # API endpoints
│
└── thesis-frontend/         # React + Vite frontend
    ├── package.json        # Node.js dependencies
    ├── src/
    │   ├── pages/          # Page components
    │   ├── components/     # Reusable components
    │   ├── hooks/          # Custom hooks
    │   ├── api/            # API client
    │   └── context/        # React context
    └── [config files]      # Vite, Tailwind, ESLint configs
```

## Prerequisites

Before setting up, ensure you have:
- **Python 3.9+** (for backend)
- **Node.js 18+** (for frontend)
- **Git**

## Setup Instructions

### 1. Clone & Navigate to Project

```bash
git clone https://github.com/PATOTSTI/oilwater-thesis.git
cd oilwater-thesis
```

### 2. Backend Setup (FastAPI)

```bash
# Navigate to backend folder
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# macOS/Linux:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt
```

**Backend dependencies include:**
- FastAPI & Uvicorn (web framework)
- PyTorch & TorchVision (ML)
- Ultralytics (object detection)
- OpenCV (computer vision)
- Pydantic (data validation)
- And more (see `requirements.txt`)

### 3. Frontend Setup (React + Vite)

```bash
# Navigate back to root, then to frontend
cd ../thesis-frontend

# Install Node.js dependencies
npm install
```

**Frontend dependencies include:**
- React 19
- Vite (bundler)
- React Router
- Axios (HTTP client)
- Recharts (charting)
- Leaflet & Mapbox GL (mapping)
- Tailwind CSS (styling)
- And more (see `package.json`)

## Running the System

### Start Backend Server

```bash
# From backend folder (with venv activated)
cd backend
python main.py
# or
uvicorn main:app --reload
```

Server runs on: `http://localhost:8000`

### Start Frontend Dev Server

```bash
# From frontend folder (in new terminal)
cd thesis-frontend
npm run dev
```

Frontend runs on: `http://localhost:5173` (or shown in terminal)

## Available Scripts

### Frontend

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build
npm run lint      # Run ESLint
```

### Backend

No npm scripts needed. Run with Python directly or use uvicorn with `--reload` for hot reload.

## Environment Variables

Create `.env` files as needed:

**Backend** (`.env` in backend folder):
```
DATABASE_URL=your_database_url
API_KEY=your_api_key
```

**Frontend** (`.env` in thesis-frontend folder):
```
VITE_API_URL=http://localhost:8000
```

Note: `.env` files are ignored by git (see `.gitignore`)

## API Documentation

Once the backend is running, access the interactive API docs:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Development Tips

- Keep backend and frontend running in separate terminals
- Frontend uses Vite for fast hot module replacement (HMR)
- Backend uses `--reload` flag for auto-restart on code changes
- Check `.gitignore` for files to exclude from version control

## Troubleshooting

**Backend issues:**
- Ensure virtual environment is activated
- Verify Python 3.9+ installed: `python --version`
- Clear cache: `pip cache purge`

**Frontend issues:**
- Clear node_modules: `rm -r node_modules && npm install`
- Clear npm cache: `npm cache clean --force`
- Ensure Node 18+: `node --version`

## Contributing

1. Create a feature branch: `git checkout -b feature-name`
2. Make changes and commit
3. Push to branch: `git push origin feature-name`
4. Submit a pull request

## License

[Add your license info here]

## Contact

[Add contact info here]
