#!/usr/bin/env python3
"""Test VIGL scanner JSON output"""
import subprocess
import os
import sys
import time
import json

def test_scanner():
    print("🔍 Testing VIGL scanner JSON output...")
    
    # Set environment
    env = os.environ.copy()
    env['POLYGON_API_KEY'] = 'nTXyESvlVLpQE3hKCJWtsS5BHkhAqq1C'
    
    start_time = time.time()
    
    try:
        # Run with timeout
        result = subprocess.run(
            ['python3', 'VIGL_Discovery_Complete.py', '--json'],
            capture_output=True,
            text=True,
            timeout=120,  # 2 minutes for testing
            env=env,
            cwd='.'
        )
        
        elapsed = time.time() - start_time
        
        print(f"⏱️ Scanner completed in {elapsed:.1f} seconds")
        print(f"📊 Return code: {result.returncode}")
        print(f"📊 STDOUT length: {len(result.stdout)} characters")
        print(f"📊 STDERR length: {len(result.stderr)} characters")
        
        # Show first/last parts of stderr (logs)
        if result.stderr:
            stderr_lines = result.stderr.split('\n')
            print(f"📝 STDERR first 3 lines:")
            for line in stderr_lines[:3]:
                print(f"   {line}")
            if len(stderr_lines) > 6:
                print(f"   ... ({len(stderr_lines)-6} more lines)")
                print(f"📝 STDERR last 3 lines:")
                for line in stderr_lines[-3:]:
                    print(f"   {line}")
        
        # Analyze stdout
        if result.stdout.strip():
            print("📊 STDOUT content preview:")
            print(f"   First 200 chars: {result.stdout[:200]}")
            print(f"   Last 200 chars: {result.stdout[-200:]}")
            
            # Try to parse as JSON
            try:
                data = json.loads(result.stdout)
                print(f"✅ Valid JSON with {len(data)} items")
                if data:
                    print(f"📈 Sample discovery: {data[0]}")
                return data
            except json.JSONDecodeError as e:
                print(f"❌ Invalid JSON: {e}")
                # Try to find JSON in the output
                stdout_lines = result.stdout.split('\n')
                for i, line in enumerate(stdout_lines):
                    if line.strip().startswith('[') or line.strip().startswith('{'):
                        print(f"🔍 Potential JSON starts at line {i}: {line[:50]}")
                        break
                return None
        else:
            print("⚠️ No STDOUT output from scanner")
            return None
            
    except subprocess.TimeoutExpired:
        elapsed = time.time() - start_time
        print(f"⏱️ Scanner timeout after {elapsed:.1f} seconds")
        return None
        
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"❌ Scanner error after {elapsed:.1f} seconds: {e}")
        return None

if __name__ == "__main__":
    discoveries = test_scanner()
    if discoveries:
        print(f"🎯 SUCCESS: Found {len(discoveries)} discoveries")
    else:
        print("❌ FAILED: No valid discoveries")
        sys.exit(1)