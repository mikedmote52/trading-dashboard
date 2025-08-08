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

class PortfolioAlert(BaseModel):
    symbol: str
    current_price: float
    entry_price: float
    pnl_percent: float
    market_value: float
    position_weight: float
    days_held: int
    risk_score: float
    action: str
    alert_level: str
    message: str
    thesis_status: str
    created_at: datetime

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

@app.get("/portfolio/alerts")
async def get_portfolio_alerts(
    alert_level: Optional[str] = Query(None, description="Filter by alert level (CRITICAL, WARNING, OPPORTUNITY)")
):
    """Get latest portfolio alerts"""
    try:
        cursor = db.connection.cursor()
        
        if alert_level:
            cursor.execute("""
                SELECT * FROM latest_portfolio_alerts
                WHERE alert_level = %s
                ORDER BY risk_score DESC
            """, (alert_level,))
        else:
            cursor.execute("""
                SELECT * FROM latest_portfolio_alerts
                ORDER BY 
                    CASE alert_level 
                        WHEN 'CRITICAL' THEN 1
                        WHEN 'WARNING' THEN 2
                        WHEN 'OPPORTUNITY' THEN 3
                        ELSE 4
                    END,
                    risk_score DESC
            """)
        
        columns = [desc[0] for desc in cursor.description]
        alerts_data = []
        
        for row in cursor.fetchall():
            alerts_data.append(dict(zip(columns, row)))
        
        # Convert to Pydantic models
        alerts = [PortfolioAlert(**data) for data in alerts_data]
        
        cursor.close()
        
        return {
            "success": True,
            "data": alerts,
            "count": len(alerts),
            "timestamp": datetime.now()
        }
        
    except Exception as e:
        logger.error(f"❌ Portfolio alerts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/portfolio/critical")
async def get_critical_portfolio_alerts():
    """Get only critical portfolio alerts"""
    try:
        cursor = db.connection.cursor()
        
        cursor.execute("""
            SELECT * FROM critical_portfolio_alerts
        """)
        
        columns = [desc[0] for desc in cursor.description]
        alerts_data = []
        
        for row in cursor.fetchall():
            alerts_data.append(dict(zip(columns, row)))
        
        alerts = [PortfolioAlert(**data) for data in alerts_data]
        
        cursor.close()
        
        return {
            "success": True,
            "data": alerts,
            "count": len(alerts),
            "timestamp": datetime.now()
        }
        
    except Exception as e:
        logger.error(f"❌ Critical alerts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/portfolio/health")
async def get_portfolio_health():
    """Get portfolio health summary"""
    try:
        cursor = db.connection.cursor()
        
        cursor.execute("""
            SELECT * FROM portfolio_health
            ORDER BY created_at DESC
            LIMIT 1
        """)
        
        result = cursor.fetchone()
        
        if result:
            columns = [desc[0] for desc in cursor.description]
            health_data = dict(zip(columns, result))
        else:
            health_data = {
                "total_positions": 0,
                "total_value": 0,
                "average_pnl_percent": 0,
                "high_risk_positions": 0,
                "sell_signals": 0,
                "profit_signals": 0
            }
        
        cursor.close()
        
        return {
            "success": True,
            "data": health_data,
            "timestamp": datetime.now()
        }
        
    except Exception as e:
        logger.error(f"❌ Portfolio health error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health/db")
async def health_db():
    """Database connectivity check"""
    try:
        cursor = db.connection.cursor()
        cursor.execute("SELECT 1")
        result = cursor.fetchone()
        cursor.close()
        
        return {
            "db": "ok", 
            "result": result[0] if result else None,
            "timestamp": datetime.now()
        }
    except Exception as e:
        return {
            "db": "error",
            "error": str(e),
            "timestamp": datetime.now()
        }

@app.get("/discoveries/debug")
async def discoveries_debug():
    """Debug endpoint to check raw discovery data"""
    try:
        cursor = db.connection.cursor()
        cursor.execute("""
            SELECT id, symbol, vigl_similarity, confidence_score, created_at, discovered_at
            FROM vigl_discoveries
            ORDER BY created_at DESC
            LIMIT 10
        """)
        
        columns = [desc[0] for desc in cursor.description]
        rows = []
        
        for row in cursor.fetchall():
            row_dict = dict(zip(columns, row))
            # Convert datetime objects to strings for JSON serialization
            for key, value in row_dict.items():
                if isinstance(value, datetime):
                    row_dict[key] = value.isoformat()
            rows.append(row_dict)
        
        cursor.close()
        
        return {
            "count": len(rows),
            "rows": rows,
            "timestamp": datetime.now(),
            "table": "vigl_discoveries"
        }
        
    except Exception as e:
        logger.error(f"Debug endpoint error: {e}")
        return {
            "count": 0,
            "rows": [],
            "error": str(e),
            "timestamp": datetime.now()
        }

@app.get("/system/status")
async def system_status():
    """Complete system status check"""
    try:
        cursor = db.connection.cursor()
        
        # Check database connection
        cursor.execute("SELECT 1")
        db_status = "ok"
        
        # Count total discoveries
        cursor.execute("SELECT COUNT(*) FROM vigl_discoveries")
        total_discoveries = cursor.fetchone()[0]
        
        # Get latest discovery
        cursor.execute("""
            SELECT symbol, created_at, vigl_similarity 
            FROM vigl_discoveries 
            ORDER BY created_at DESC 
            LIMIT 1
        """)
        latest = cursor.fetchone()
        
        # Get discoveries in last hour
        cursor.execute("""
            SELECT COUNT(*) FROM vigl_discoveries 
            WHERE created_at > NOW() - INTERVAL '1 hour'
        """)
        recent_count = cursor.fetchone()[0]
        
        cursor.close()
        
        return {
            "api_status": "healthy",
            "database_status": db_status,
            "total_discoveries": total_discoveries,
            "discoveries_last_hour": recent_count,
            "latest_discovery": {
                "symbol": latest[0] if latest else None,
                "created_at": latest[1].isoformat() if latest else None,
                "similarity": float(latest[2]) if latest else None
            } if latest else None,
            "database_host": db.database_url.split('@')[1].split('/')[0] if '@' in db.database_url else "unknown",
            "timestamp": datetime.now()
        }
        
    except Exception as e:
        return {
            "api_status": "error",
            "database_status": "error",
            "error": str(e),
            "timestamp": datetime.now()
        }

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