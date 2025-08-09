#!/usr/bin/env python3
"""Time the VIGL scanner execution"""
import time
import subprocess
import os

start_time = time.time()
print(f"⏱️ Starting VIGL scanner timing test at {time.strftime('%H:%M:%S')}")

try:
    # Run scanner with very long timeout
    env = os.environ.copy()
    env['POLYGON_API_KEY'] = 'p50INptuiQ05FW6FwGREFqo8dSzcuq36'
    
    result = subprocess.run(
        ['python3', 'VIGL_Discovery_Complete.py', '--json'],
        capture_output=True,
        text=True,
        timeout=1200,  # 20 minutes max
        env=env
    )
    
    elapsed = time.time() - start_time
    
    print(f"✅ Scanner completed in {elapsed:.1f} seconds ({elapsed/60:.1f} minutes)")
    print(f"📊 Output size: {len(result.stdout)} characters")
    
    # Try to parse JSON to count discoveries
    try:
        import json
        data = json.loads(result.stdout)
        if isinstance(data, dict) and 'discoveries' in data:
            print(f"🎯 Found {len(data['discoveries'])} discoveries")
        elif isinstance(data, list):
            print(f"🎯 Found {len(data)} discoveries")
    except:
        print("⚠️ Could not parse JSON output")
    
except subprocess.TimeoutExpired:
    elapsed = time.time() - start_time
    print(f"❌ Scanner timeout after {elapsed:.1f} seconds")
    
except Exception as e:
    elapsed = time.time() - start_time
    print(f"❌ Scanner error after {elapsed:.1f} seconds: {e}")

print(f"\n📈 RECOMMENDATION: Set timeout to {int(elapsed * 1.5)} seconds for safety margin")