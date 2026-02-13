"""
Test script to verify tier resolution logic.
Simulates frontend Supabase queries to check tier assignment.
"""
import asyncio
import httpx
import os
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

SUPABASE_URL = os.environ.get('SUPABASE_URL', '')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
    'Content-Type': 'application/json',
}

async def get_all_profiles():
    """Get all profiles"""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f'{SUPABASE_URL}/rest/v1/profiles?select=id,name,role',
            headers=headers,
        )
        return r.json() if r.status_code == 200 else []

async def get_subscriptions_for_user(user_id: str):
    """Get subscriptions with plan info for a user"""
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            f'{SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.{user_id}&status=eq.active&select=id,status,current_period_end,plans(tier)',
            headers=headers,
        )
        return r.json() if r.status_code == 200 else []

def resolve_tier(profile_role: str, subscriptions: list) -> str:
    """
    Resolve tier using the correct precedence:
    1. super_admin → vip
    2. admin → vip
    3. Active VIP subscription → vip
    4. Active Premium subscription → premium
    5. Otherwise → free
    """
    # Check admin roles first
    if profile_role in ('super_admin', 'admin'):
        return 'vip'
    
    # Filter active subscriptions
    from datetime import datetime
    now = datetime.utcnow().isoformat() + 'Z'
    
    active_subs = []
    for sub in subscriptions:
        if not sub.get('current_period_end'):
            active_subs.append(sub)  # NULL = never expires
        elif sub['current_period_end'] > now:
            active_subs.append(sub)
    
    if not active_subs:
        return 'free'
    
    # Find highest tier
    tier_priority = {'vip': 2, 'premium': 1, 'free': 0}
    highest_tier = 'free'
    highest_priority = 0
    
    for sub in active_subs:
        tier = (sub.get('plans') or {}).get('tier', 'free').lower()
        priority = tier_priority.get(tier, 0)
        if priority > highest_priority:
            highest_priority = priority
            highest_tier = tier
    
    return highest_tier

async def main():
    print("=" * 60)
    print("TIER RESOLUTION TEST")
    print("=" * 60)
    
    profiles = await get_all_profiles()
    print(f"\nFound {len(profiles)} profiles\n")
    
    for profile in profiles[:10]:  # Limit to first 10
        user_id = profile['id']
        name = profile.get('name', 'Unknown')
        role = profile.get('role', 'user')
        
        subs = await get_subscriptions_for_user(user_id)
        resolved_tier = resolve_tier(role, subs)
        
        print(f"User: {name}")
        print(f"  Profile Role: {role}")
        print(f"  Active Subscriptions: {len(subs)}")
        for sub in subs:
            plan_tier = (sub.get('plans') or {}).get('tier', 'unknown')
            expiry = sub.get('current_period_end', 'NULL (never expires)')
            print(f"    - Plan: {plan_tier}, Expires: {expiry}")
        print(f"  → RESOLVED TIER: {resolved_tier}")
        print()

if __name__ == '__main__':
    asyncio.run(main())
