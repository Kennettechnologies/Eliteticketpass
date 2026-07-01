from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def get_user_from_token(token_str: str):
    try:
        from rest_framework_simplejwt.tokens import UntypedToken
        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
        from rest_framework_simplejwt.backends import TokenBackend
        from django.conf import settings
        from apps.users.models import User
        import uuid

        UntypedToken(token_str)
        backend = TokenBackend(algorithm="HS256", signing_key=settings.SECRET_KEY)
        payload = backend.decode(token_str, verify=True)
        user_id = payload.get("user_id")
        return User.objects.get(id=user_id)
    except Exception:
        return AnonymousUser()


class JwtAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query_string = scope.get("query_string", b"").decode()
        token_str = None
        for part in query_string.split("&"):
            if part.startswith("token="):
                token_str = part.split("=", 1)[1]
                break

        scope["user"] = await get_user_from_token(token_str) if token_str else AnonymousUser()
        return await super().__call__(scope, receive, send)


def JwtAuthMiddlewareStack(inner):
    return JwtAuthMiddleware(inner)
