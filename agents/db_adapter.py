"""
Database adapter for Python agents
Supports both SQLite and Postgres based on environment
"""

import os
import sqlite3
import json
from typing import Any, Dict, List, Optional, Tuple
from contextlib import contextmanager

# Try to import psycopg2
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
    HAS_POSTGRES = True
except ImportError:
    HAS_POSTGRES = False
    print("[db_adapter] psycopg2 not installed, using SQLite only")

class DatabaseAdapter:
    def __init__(self):
        self.type = None
        self.connection = None
        self.db_path = None
        self.database_url = None
        self._initialize()
    
    def _initialize(self):
        """Initialize database connection based on environment"""
        use_postgres = (
            os.getenv('USE_POSTGRES', '').lower() in ('true', '1', 'yes') or
            bool(os.getenv('DATABASE_URL'))
        )
        
        if use_postgres and os.getenv('DATABASE_URL') and HAS_POSTGRES:
            # Use Postgres
            self.type = 'postgres'
            self.database_url = os.getenv('DATABASE_URL')
            print(f"[db_adapter] Using Postgres")
        else:
            # Use SQLite
            self.type = 'sqlite'
            self.db_path = os.getenv('DB_PATH', './trading_dashboard.db')
            if not os.path.isabs(self.db_path):
                self.db_path = os.path.abspath(self.db_path)
            print(f"[db_adapter] Using SQLite at {self.db_path}")
    
    @contextmanager
    def get_connection(self):
        """Get database connection with context manager"""
        if self.type == 'postgres':
            conn = psycopg2.connect(self.database_url)
            try:
                yield conn
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()
        else:
            # SQLite
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            try:
                yield conn
                conn.commit()
            except Exception as e:
                conn.rollback()
                raise e
            finally:
                conn.close()
    
    def execute(self, sql: str, params: Optional[Tuple] = None) -> Any:
        """Execute a query and return results"""
        with self.get_connection() as conn:
            if self.type == 'postgres':
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(sql, params or ())
                    if sql.strip().upper().startswith('SELECT'):
                        return cur.fetchall()
                    return cur.rowcount
            else:
                # SQLite
                cur = conn.cursor()
                cur.execute(sql, params or ())
                if sql.strip().upper().startswith('SELECT'):
                    return [dict(row) for row in cur.fetchall()]
                return cur.rowcount
    
    def executemany(self, sql: str, params_list: List[Tuple]) -> int:
        """Execute many queries"""
        with self.get_connection() as conn:
            if self.type == 'postgres':
                with conn.cursor() as cur:
                    cur.executemany(sql, params_list)
                    return cur.rowcount
            else:
                cur = conn.cursor()
                cur.executemany(sql, params_list)
                return cur.rowcount
    
    def fetchone(self, sql: str, params: Optional[Tuple] = None) -> Optional[Dict]:
        """Fetch single row"""
        rows = self.execute(sql, params)
        return rows[0] if rows else None
    
    def fetchall(self, sql: str, params: Optional[Tuple] = None) -> List[Dict]:
        """Fetch all rows"""
        return self.execute(sql, params) or []
    
    def insert_discovery(self, discovery: Dict) -> int:
        """Insert a discovery record"""
        sql = """
            INSERT INTO discoveries (
                symbol, score, latest_price, volume_ratio, 
                short_interest, borrow_fee, thesis, catalyst,
                risk_level, entry_point, stop_loss, target_1, target_2,
                discovered_at, source
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """ if self.type == 'postgres' else """
            INSERT INTO discoveries (
                symbol, score, latest_price, volume_ratio, 
                short_interest, borrow_fee, thesis, catalyst,
                risk_level, entry_point, stop_loss, target_1, target_2,
                discovered_at, source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        params = (
            discovery.get('symbol'),
            discovery.get('score', 0),
            discovery.get('latest_price', 0),
            discovery.get('volume_ratio', 0),
            discovery.get('short_interest', 0),
            discovery.get('borrow_fee', 0),
            discovery.get('thesis', ''),
            discovery.get('catalyst', ''),
            discovery.get('risk_level', 'medium'),
            discovery.get('entry_point', 0),
            discovery.get('stop_loss', 0),
            discovery.get('target_1', 0),
            discovery.get('target_2', 0),
            discovery.get('discovered_at', 'now'),
            discovery.get('source', 'universe_screener')
        )
        
        return self.execute(sql, params)
    
    def get_table_counts(self) -> Dict[str, int]:
        """Get row counts for all tables"""
        tables = [
            'discoveries', 'discoveries_vigl', 'contenders', 'decisions',
            'positions', 'theses', 'thesis_history', 'portfolio_alerts',
            'research_discoveries', 'research_performance', 'research_sessions',
            'scoring_weights', 'scoring_weights_kv', 'outcomes', 
            'trading_decisions', 'data_status'
        ]
        
        counts = {}
        for table in tables:
            try:
                sql = f"SELECT COUNT(*) as count FROM {table}"
                result = self.fetchone(sql)
                counts[table] = result['count'] if result else 0
            except Exception as e:
                counts[table] = f"error: {str(e)}"
        
        return counts

# Singleton instance
_db_instance = None

def get_db() -> DatabaseAdapter:
    """Get singleton database instance"""
    global _db_instance
    if _db_instance is None:
        _db_instance = DatabaseAdapter()
    return _db_instance

if __name__ == "__main__":
    # Test the adapter
    db = get_db()
    print(f"Database type: {db.type}")
    print(f"Table counts: {json.dumps(db.get_table_counts(), indent=2)}")