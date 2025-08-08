#!/usr/bin/env python3
"""
VIGL Background Scanner Worker
Runs continuously on Render, scanning for VIGL patterns every few minutes
"""

import os
import time
import logging
import schedule
import psycopg2
from datetime import datetime
import uuid
import json
from typing import List, Dict, Any

# Import your existing VIGL system
from VIGL_Discovery_Complete import VIGLDiscoveryAPI

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class VIGLDatabaseManager:
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.connection = None
        
        # Log database connection details for debugging
        from urllib.parse import urlparse
        u = urlparse(database_url)
        logger.warning(f"SCANNER DB wiring: host={u.hostname} db={u.path.lstrip('/')} user={u.username} ssl={('sslmode=' in database_url)}")
        
        self.connect()
    
    def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.connection = psycopg2.connect(self.database_url)
            self.connection.autocommit = True
            logger.info("✅ Connected to database")
            
            # Initialize database schema
            self.init_schema()
            
        except Exception as e:
            logger.error(f"❌ Database connection failed: {e}")
            raise
    
    def init_schema(self):
        """Initialize database schema if not exists"""
        try:
            with open('init_database.sql', 'r') as f:
                schema_sql = f.read()
            
            cursor = self.connection.cursor()
            cursor.execute(schema_sql)
            cursor.close()
            logger.info("✅ Database schema initialized")
            
        except Exception as e:
            logger.error(f"❌ Schema initialization failed: {e}")
    
    def save_discoveries(self, discoveries: List[Dict[Any, Any]], session_id: str):
        """Save VIGL discoveries to database"""
        cursor = self.connection.cursor()
        
        try:
            logger.warning(f"SCANNER attempting to save {len(discoveries)} discoveries to database")
            
            for i, discovery in enumerate(discoveries):
                logger.warning(f"SCANNER saving discovery {i+1}: {discovery.ticker} - {discovery.vigl_similarity_score}")
                cursor.execute("""
                    INSERT INTO vigl_discoveries (
                        symbol, company_name, current_price, market_cap,
                        volume_spike_ratio, momentum, pattern_strength,
                        sector, catalysts, vigl_similarity, confidence_score,
                        is_high_confidence, estimated_upside, risk_level,
                        recommendation, scan_session_id, discovered_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                """, (
                    discovery.ticker,
                    discovery.company_name,
                    discovery.current_price,
                    discovery.market_cap,
                    discovery.volume_spike_ratio,
                    discovery.price_momentum,
                    discovery.vigl_similarity_score,  # Use correct field name
                    getattr(discovery, 'sector', 'Unknown'),
                    discovery.risk_factors,
                    discovery.vigl_similarity_score,  # Use correct field name
                    discovery.confidence_level,  # Use correct field name
                    discovery.confidence_level >= 0.8,
                    discovery.estimated_upside,
                    discovery.risk_level_text,  # Use property for risk level text
                    "STRONG BUY" if discovery.confidence_level >= 0.8 else "BUY",
                    session_id
                ))
            
            # EXPLICIT COMMIT
            self.connection.commit()
            logger.warning(f"SCANNER wrote {len(discoveries)} rows - COMMITTED")
            
        except Exception as e:
            self.connection.rollback()
            logger.exception(f"SCANNER DB write failed: {e}")
            raise
        finally:
            cursor.close()
    
    def start_scan_session(self) -> str:
        """Start a new scan session"""
        session_id = str(uuid.uuid4())
        cursor = self.connection.cursor()
        
        try:
            cursor.execute("""
                INSERT INTO scan_sessions (id, started_at, status)
                VALUES (%s, %s, 'running')
            """, (session_id, datetime.now()))
            
            logger.info(f"🔍 Started scan session: {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"❌ Failed to start scan session: {e}")
            return session_id
        finally:
            cursor.close()
    
    def complete_scan_session(self, session_id: str, patterns_found: int, error_message: str = None):
        """Mark scan session as complete"""
        cursor = self.connection.cursor()
        
        try:
            cursor.execute("""
                UPDATE scan_sessions 
                SET completed_at = %s, patterns_found = %s, status = %s, error_message = %s
                WHERE id = %s
            """, (
                datetime.now(),
                patterns_found,
                'completed' if error_message is None else 'failed',
                error_message,
                session_id
            ))
            
        except Exception as e:
            logger.error(f"❌ Failed to complete scan session: {e}")
        finally:
            cursor.close()

class VIGLBackgroundWorker:
    def __init__(self):
        self.database_url = os.getenv('DATABASE_URL')
        self.polygon_api_key = os.getenv('POLYGON_API_KEY')
        
        if not self.database_url:
            raise ValueError("DATABASE_URL environment variable is required")
        if not self.polygon_api_key:
            logger.warning("⚠️ POLYGON_API_KEY not set - using demo mode")
        
        self.db = VIGLDatabaseManager(self.database_url)
        self.vigl_api = VIGLDiscoveryAPI(self.polygon_api_key)
        
        logger.info("🚀 VIGL Background Worker initialized")
    
    def run_vigl_scan(self):
        """Run a VIGL pattern discovery scan"""
        logger.info("🔍 Starting VIGL pattern scan...")
        
        session_id = self.db.start_scan_session()
        error_message = None
        patterns_found = 0
        
        try:
            # Run the real VIGL discovery
            discoveries = self.vigl_api.find_daily_opportunities()
            
            if discoveries:
                # Save to database
                self.db.save_discoveries(discoveries, session_id)
                patterns_found = len(discoveries)
                
                logger.info(f"✅ Scan complete: Found {patterns_found} VIGL patterns")
                
                # Log top patterns
                for discovery in discoveries[:3]:  # Top 3
                    logger.info(f"   🎯 {discovery.ticker}: {discovery.confidence_score:.0%} confidence")
            else:
                logger.info("📊 Scan complete: No VIGL patterns found above threshold")
        
        except Exception as e:
            error_message = str(e)
            logger.error(f"❌ VIGL scan failed: {error_message}")
        
        finally:
            self.db.complete_scan_session(session_id, patterns_found, error_message)
    
    def start_scheduler(self):
        """Start the background scheduler"""
        # Schedule scans every 10 minutes during market hours
        schedule.every(10).minutes.do(self.run_vigl_scan)
        
        # Initial scan
        logger.info("🎯 Running initial VIGL scan...")
        self.run_vigl_scan()
        
        logger.info("⏰ VIGL scheduler started - scanning every 10 minutes")
        
        # Keep running
        while True:
            schedule.run_pending()
            time.sleep(60)  # Check every minute

if __name__ == "__main__":
    try:
        worker = VIGLBackgroundWorker()
        worker.start_scheduler()
    except KeyboardInterrupt:
        logger.info("🛑 VIGL worker stopped by user")
    except Exception as e:
        logger.error(f"💥 VIGL worker crashed: {e}")
        raise