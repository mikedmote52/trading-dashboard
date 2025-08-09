#!/usr/bin/env python3
"""Debug the VIGL scanner to see what discoveries it finds"""
import subprocess
import os

def debug_scanner():
    print("🔍 Running VIGL scanner in normal mode to see discoveries...")
    
    env = os.environ.copy()
    env['POLYGON_API_KEY'] = 'nTXyESvlVLpQE3hKCJWtsS5BHkhAqq1C'
    
    try:
        # Run without --json to see what it finds
        result = subprocess.run(
            ['python3', 'VIGL_Discovery_Complete.py'],
            capture_output=True,
            text=True,
            timeout=90,
            env=env
        )
        
        print(f"Return code: {result.returncode}")
        print(f"STDOUT length: {len(result.stdout)}")
        print(f"STDERR length: {len(result.stderr)}")
        
        # Show the actual discoveries from stdout
        if result.stdout:
            print("\n📊 STDOUT (discoveries):")
            lines = result.stdout.split('\n')
            for line in lines[-50:]:  # Show last 50 lines where results usually are
                if line.strip():
                    print(f"   {line}")
        
        # Show any errors that might be preventing JSON output
        if result.stderr:
            stderr_lines = result.stderr.split('\n')
            print(f"\n📝 STDERR summary ({len(stderr_lines)} lines):")
            # Show lines with "ERROR" or "VIGL MATCH"
            for line in stderr_lines:
                if 'ERROR' in line or 'VIGL MATCH' in line or 'Found' in line:
                    print(f"   {line}")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    debug_scanner()