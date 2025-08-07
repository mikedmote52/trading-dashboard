#!/usr/bin/env python3
"""
VIGL API Service
FastAPI service that serves real-time VIGL discoveries from database
"""

import os
import logging
import psycopg2
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="VIGL Discovery API",
    description="Real-time VIGL pattern discovery API",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class VIGLDiscovery(BaseModel):
    symbol: str
    company_name: str
    current_price: float
    market_cap: int
    volume_spike_ratio: float
    momentum: float
    pattern_strength: float
    sector: str
    catalysts: List[str]
    vigl_similarity: float
    confidence_score: float
    is_high_confidence: bool
    estimated_upside: str
    risk_level: str
    recommendation: str
    discovered_at: datetime

class APIResponse(BaseModel):
    success: bool
    data: List[VIGLDiscovery]
    count: int
    last_updated: datetime
    scan_time: Optional[str] = None

class DatabaseManager:
    def __init__(self):
        self.database_url = os.getenv('DATABASE_URL')
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        
        self.connection = None
        self.connect()
    
    def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.connection = psycopg2.connect(self.database_url)
            logger.info("✅ API connected to database")
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            raise
    
    def get_latest_discoveries(self, min_confidence: float = 0.6) -> List[Dict[str, Any]]:
        """Get latest VIGL discoveries from database"""
        cursor = self.connection.cursor()
        
        try:
            cursor.execute("""
                SELECT 
                    symbol, company_name, current_price, market_cap,
                    volume_spike_ratio, momentum, pattern_strength,
                    sector, catalysts, vigl_similarity, confidence_score,
                    is_high_confidence, estimated_upside, risk_level,
                    recommendation, discovered_at
                FROM latest_vigl_discoveries
                WHERE confidence_score >= %s
                ORDER BY confidence_score DESC, discovered_at DESC
            """, (min_confidence,))
            
            columns = [desc[0] for desc in cursor.description]
            results = []
            
            for row in cursor.fetchall():
                results.append(dict(zip(columns, row)))
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Failed to fetch discoveries: {e}")
            return []
        finally:
            cursor.close()
    
    def get_top_patterns(self) -> List[Dict[str, Any]]:
        """Get top VIGL patterns (high confidence)"""
        cursor = self.connection.cursor()
        
        try:
            cursor.execute("""
                SELECT * FROM top_vigl_patterns
                ORDER BY confidence_score DESC, volume_spike_ratio DESC
                LIMIT 10
            """)
            
            columns = [desc[0] for desc in cursor.description]
            results = []
            
            for row in cursor.fetchall():
                results.append(dict(zip(columns, row)))
            
            return results
            
        except Exception as e:
            logger.error(f"❌ Failed to fetch top patterns: {e}")
            return []
        finally:
            cursor.close()
    
    def get_scan_stats(self) -> Dict[str, Any]:
        """Get scan statistics"""
        cursor = self.connection.cursor()
        
        try:
            cursor.execute("""
                SELECT 
                    COUNT(*) as total_scans,
                    MAX(completed_at) as last_scan,
                    AVG(patterns_found) as avg_patterns,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_scans
                FROM scan_sessions 
                WHERE started_at > NOW() - INTERVAL '24 hours'
            """)
            
            result = cursor.fetchone()
            
            return {
                "total_scans": result[0] or 0,
                "last_scan": result[1],
                "avg_patterns": float(result[2] or 0),
                "successful_scans": result[3] or 0
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to fetch scan stats: {e}")
            return {}
        finally:
            cursor.close()

# Initialize database manager
db = DatabaseManager()

@app.get("/")
async def root():
    """API health check"""
    return {
        "message": "VIGL Discovery API",
        "status": "healthy",
        "timestamp": datetime.now()
    }

@app.get("/vigl/latest", response_model=APIResponse)
async def get_latest_vigl_discoveries(
    min_confidence: float = Query(0.6, ge=0.0, le=1.0, description="Minimum confidence score")
):
    """Get latest VIGL discoveries"""
    try:
        discoveries_data = db.get_latest_discoveries(min_confidence)
        
        # Convert to Pydantic models
        discoveries = []
        for data in discoveries_data:
            discoveries.append(VIGLDiscovery(**data))
        
        return APIResponse(
            success=True,
            data=discoveries,
            count=len(discoveries),
            last_updated=datetime.now(),
            scan_time=discoveries[0].discovered_at.isoformat() if discoveries else None
        )
        
    except Exception as e:
        logger.error(f"❌ API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/vigl/top", response_model=APIResponse)
async def get_top_vigl_patterns():
    """Get top VIGL patterns (high confidence)"""
    try:
        discoveries_data = db.get_top_patterns()
        
        # Convert to Pydantic models
        discoveries = []
        for data in discoveries_data:
            discoveries.append(VIGLDiscovery(**data))
        
        return APIResponse(
            success=True,
            data=discoveries,
            count=len(discoveries),
            last_updated=datetime.now()
        )
        
    except Exception as e:
        logger.error(f"❌ API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/vigl/stats")
async def get_scan_statistics():
    """Get VIGL scan statistics"""
    try:
        stats = db.get_scan_stats()
        return {
            "success": True,
            "stats": stats,
            "timestamp": datetime.now()
        }
        
    except Exception as e:
        logger.error(f"❌ API error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Service health check"""
    return {
        "status": "healthy",
        "service": "vigl-api",
        "timestamp": datetime.now(),
        "database": "connected" if db.connection else "disconnected"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)