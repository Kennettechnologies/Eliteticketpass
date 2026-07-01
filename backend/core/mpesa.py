import threading
import time
import requests
from django.conf import settings
from django.core.cache import cache
from core.utils import get_daraja_timestamp, get_daraja_password, normalise_mpesa_phone


class DarajaError(Exception):
    pass


class DarajaClient:
    SANDBOX_BASE = "https://sandbox.safaricom.co.ke"
    PRODUCTION_BASE = "https://api.safaricom.co.ke"

    _token_lock = threading.Lock()

    @property
    def env(self):
        from apps.admin_panel.models import PlatformConfig
        conf = PlatformConfig.objects.filter(key="daraja_env").first()
        return conf.value if conf else getattr(settings, "MPESA_ENV", "sandbox")

    @property
    def consumer_key(self):
        from apps.admin_panel.models import PlatformConfig
        conf = PlatformConfig.objects.filter(key="daraja_consumer_key").first()
        return conf.value if conf else getattr(settings, "MPESA_CONSUMER_KEY", "")

    @property
    def consumer_secret(self):
        from apps.admin_panel.models import PlatformConfig
        conf = PlatformConfig.objects.filter(key="daraja_consumer_secret").first()
        return conf.value if conf else getattr(settings, "MPESA_CONSUMER_SECRET", "")

    @property
    def shortcode(self):
        from apps.admin_panel.models import PlatformConfig
        conf = PlatformConfig.objects.filter(key="daraja_shortcode").first()
        return conf.value if conf else getattr(settings, "MPESA_SHORTCODE", "")

    @property
    def passkey(self):
        from apps.admin_panel.models import PlatformConfig
        conf = PlatformConfig.objects.filter(key="daraja_passkey").first()
        return conf.value if conf else getattr(settings, "MPESA_PASSKEY", "")

    @property
    def base_url(self):
        return self.PRODUCTION_BASE if self.env == "production" else self.SANDBOX_BASE

    def __init__(self):
        self.callback_base = getattr(settings, "MPESA_CALLBACK_BASE_URL", "http://localhost:8000").rstrip("/")
        self.b2c_initiator = getattr(settings, "MPESA_B2C_INITIATOR_NAME", "")
        self.b2c_credential = getattr(settings, "MPESA_B2C_SECURITY_CREDENTIAL", "")

    def _get_access_token(self) -> str:
        cache_key = "daraja_access_token"
        token = cache.get(cache_key)
        if token:
            return token

        with self._token_lock:
            token = cache.get(cache_key)
            if token:
                return token

            resp = requests.get(
                f"{self.base_url}/oauth/v1/generate?grant_type=client_credentials",
                auth=(self.consumer_key, self.consumer_secret),
                timeout=15,
            )
            if resp.status_code != 200:
                raise DarajaError(f"Failed to get Daraja token: {resp.text}")

            data = resp.json()
            token = data["access_token"]
            expires_in = int(data.get("expires_in", 3600))
            # Cache with 60s buffer
            cache.set(cache_key, token, timeout=expires_in - 60)
            return token

    def _headers(self) -> dict:
        return {"Authorization": f"Bearer {self._get_access_token()}", "Content-Type": "application/json"}

    def initiate_stk_push(self, phone: str, amount: int, order_number: str, description: str, callback_url: str = None) -> dict:
        """Initiate STK Push. Returns dict with CheckoutRequestID and MerchantRequestID."""
        phone = normalise_mpesa_phone(phone)
        timestamp = get_daraja_timestamp()
        password = get_daraja_password(self.shortcode, self.passkey, timestamp)
        description = description[:13]  # Daraja cap

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": int(amount),
            "PartyA": phone,
            "PartyB": self.shortcode,
            "PhoneNumber": phone,
            "CallBackURL": callback_url or f"{self.callback_base}/api/v1/mpesa/callback/",
            "AccountReference": order_number,
            "TransactionDesc": description,
        }

        resp = requests.post(
            f"{self.base_url}/mpesa/stkpush/v1/processrequest",
            json=payload,
            headers=self._headers(),
            timeout=30,
        )

        if resp.status_code != 200:
            raise DarajaError(f"STK Push failed: {resp.text}")

        data = resp.json()
        if data.get("ResponseCode") != "0":
            raise DarajaError(data.get("ResponseDescription", "STK Push error"))

        return {
            "checkout_request_id": data["CheckoutRequestID"],
            "merchant_request_id": data["MerchantRequestID"],
        }

    def query_stk_status(self, checkout_request_id: str) -> dict:
        """Query the status of an STK Push request."""
        timestamp = get_daraja_timestamp()
        password = get_daraja_password(self.shortcode, self.passkey, timestamp)

        payload = {
            "BusinessShortCode": self.shortcode,
            "Password": password,
            "Timestamp": timestamp,
            "CheckoutRequestID": checkout_request_id,
        }

        resp = requests.post(
            f"{self.base_url}/mpesa/stkpushquery/v1/query",
            json=payload,
            headers=self._headers(),
            timeout=30,
        )

        if resp.status_code != 200:
            raise DarajaError(f"STK Query failed: {resp.text}")

        data = resp.json()
        return {
            "result_code": data.get("ResultCode"),
            "result_desc": data.get("ResultDesc", ""),
        }

    def initiate_b2c(self, phone: str, amount: int, remarks: str, occasion: str = "") -> dict:
        """Initiate B2C payout. Returns dict with ConversationID."""
        phone = normalise_mpesa_phone(phone)

        payload = {
            "InitiatorName": self.b2c_initiator,
            "SecurityCredential": self.b2c_credential,
            "CommandID": "BusinessPayment",
            "Amount": int(amount),
            "PartyA": self.shortcode,
            "PartyB": phone,
            "Remarks": remarks[:100],
            "QueueTimeOutURL": f"{self.callback_base}/api/v1/mpesa/b2c/timeout/",
            "ResultURL": f"{self.callback_base}/api/v1/mpesa/b2c/result/",
            "Occasion": occasion[:100],
        }

        resp = requests.post(
            f"{self.base_url}/mpesa/b2c/v3/paymentrequest",
            json=payload,
            headers=self._headers(),
            timeout=30,
        )

        if resp.status_code != 200:
            raise DarajaError(f"B2C initiation failed: {resp.text}")

        data = resp.json()
        if data.get("ResponseCode") != "0":
            raise DarajaError(data.get("ResponseDescription", "B2C error"))

        return {"conversation_id": data["ConversationID"], "originator_conversation_id": data["OriginatorConversationID"]}


daraja = DarajaClient()
