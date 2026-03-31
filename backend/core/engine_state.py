"""
core/engine_state.py — Shared mutable state for the signal engine.
Both main.py and admin routes import from here so they share the same state.
"""
price_automation_running = False
engine_task = None
