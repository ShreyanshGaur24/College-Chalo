"""
College-Chalo Application Launcher
Starts the Flask server on http://127.0.0.1:5000 with preloaded communities.
"""

from backend.app import app
from backend.seed_data import seed

if __name__ == "__main__":
    print("\n" + "="*70)
    print("  COLLEGE-CHALO: ROLE-BASED RIDE SHARING PLATFORM")
    print("  Strict separation for Student, Faculty, and Staff Communities")
    print("="*70)
    print("  Initializing database and seeding isolated communities...")
    seed()
    print("\n  Web Application running at: http://127.0.0.1:5000")
    print("  Press Ctrl+C to terminate.")
    print("="*70 + "\n")
    app.run(host="127.0.0.1", port=5000, debug=False)
    
