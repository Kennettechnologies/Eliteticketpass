from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status


class DarajaError(Exception):
    pass


class PaymentError(Exception):
    pass


class TicketIssuanceError(Exception):
    pass


class InsufficientStockError(Exception):
    def __init__(self, tier_name: str, available: int, requested: int):
        self.tier_name = tier_name
        self.available = available
        self.requested = requested
        super().__init__(f"Only {available} tickets left for '{tier_name}', requested {requested}.")


class CheckoutSessionExpiredError(Exception):
    pass


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)

    if response is not None:
        if isinstance(response.data, dict) and "detail" in response.data:
            message = str(response.data["detail"])
        elif isinstance(response.data, list):
            message = response.data[0] if response.data else "An error occurred."
        elif isinstance(response.data, dict):
            first_key = next(iter(response.data), None)
            if first_key:
                val = response.data[first_key]
                message = f"{first_key}: {val[0] if isinstance(val, list) else val}"
            else:
                message = "An error occurred."
        else:
            message = str(response.data)

        response.data = {
            "success": False,
            "data": None,
            "error": message,
            "meta": None,
        }
        return response

    if isinstance(exc, InsufficientStockError):
        return Response(
            {"success": False, "data": None, "error": str(exc), "meta": {"tier": exc.tier_name}},
            status=status.HTTP_409_CONFLICT,
        )

    if isinstance(exc, CheckoutSessionExpiredError):
        return Response(
            {"success": False, "data": None, "error": "Checkout session expired.", "meta": None},
            status=status.HTTP_410_GONE,
        )

    return None


def api_response(data=None, message: str = "", meta: dict = None, status_code: int = 200):
    """Helper to return a consistent envelope response."""
    from rest_framework.response import Response
    return Response(
        {"success": True, "data": data, "error": None, "meta": meta},
        status=status_code,
    )
