
try:
    from app.config import get_settings
    print("Attempting to load settings...")
    settings = get_settings()
    print("Settings loaded successfully.")
except Exception as e:
    print(f"Failed to load settings: {e}")
    import traceback
    traceback.print_exc()
