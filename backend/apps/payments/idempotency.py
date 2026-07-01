from django.core.cache import cache

def is_already_processed(key: str, ttl: int = 86400) -> bool:
    """
    Returns True if this key has already been processed.
    Uses Redis via Django cache. TTL default = 24 hours.
    Call BEFORE processing any webhook or payment confirmation.
    """
    cache_key = f"processed_webhook:{key}"
    if cache.get(cache_key):
        return True
    cache.set(cache_key, True, ttl)
    return False
