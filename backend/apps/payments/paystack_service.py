import requests
from django.conf import settings
from apps.admin_panel.models import PlatformConfig
import logging

logger = logging.getLogger(__name__)

PAYSTACK_BASE = "https://api.paystack.co"

class PaystackService:

    @property
    def secret(self):
        conf = PlatformConfig.objects.filter(key="paystack_secret_key").first()
        return conf.value if conf else getattr(settings, "PAYSTACK_SECRET_KEY", "")

    @property
    def headers(self):
        return {
            "Authorization": f"Bearer {self.secret}",
            "Content-Type": "application/json",
        }

    def initialize_transaction(self, email: str, amount_kobo: int, reference: str,
                               metadata: dict = None):
        """
        Initialize a Paystack payment (card/bank).
        amount_kobo: amount in smallest currency unit (kobo for NGN, pesewas for GHS)
        Returns authorization_url for redirect, and access_code.
        """
        payload = {
            "email": email,
            "amount": amount_kobo,
            "reference": reference,
            "callback_url": getattr(settings, "PAYSTACK_CALLBACK_URL", ""),
            "metadata": metadata or {},
        }
        response = requests.post(
            f"{PAYSTACK_BASE}/transaction/initialize",
            json=payload,
            headers=self.headers,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()['data']

    def verify_transaction(self, reference: str):
        """
        Verify a transaction by reference.
        ALWAYS verify server-side — never trust client-side confirmation.
        Returns full transaction data dict.
        """
        response = requests.get(
            f"{PAYSTACK_BASE}/transaction/verify/{reference}",
            headers=self.headers,
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()['data']
        if data['status'] != 'success':
            raise ValueError(f"Transaction {reference} not successful: {data['status']}")
        return data

    def create_transfer_recipient(self, account_name: str, account_number: str,
                                  bank_code: str, currency: str = 'KES'):
        """
        Register an organizer's bank account as a Paystack Transfer Recipient.
        Store the returned recipient_code in OrganizerPayoutProfile.
        Call once when organizer saves bank details, not on every payout.
        """
        payload = {
            "type": "nuban",
            "name": account_name,
            "account_number": account_number,
            "bank_code": bank_code,
            "currency": currency,
        }
        response = requests.post(
            f"{PAYSTACK_BASE}/transferrecipient",
            json=payload,
            headers=self.headers,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()['data']

    def initiate_transfer(self, recipient_code: str, amount_kobo: int,
                          reason: str, reference: str):
        """
        Transfer money to an organizer's bank account.
        recipient_code: from create_transfer_recipient (stored on OrganizerPayoutProfile)
        Requires OTP or pre-approved on Paystack dashboard for automation.
        """
        payload = {
            "source": "balance",
            "amount": amount_kobo,
            "recipient": recipient_code,
            "reason": reason[:40],
            "reference": reference,
        }
        response = requests.post(
            f"{PAYSTACK_BASE}/transfer",
            json=payload,
            headers=self.headers,
            timeout=15,
        )
        response.raise_for_status()
        return response.json()['data']

    def get_banks(self, country: str = 'kenya'):
        """Fetch list of supported banks for dropdown in organizer payout form."""
        response = requests.get(
            f"{PAYSTACK_BASE}/bank?country={country}&per_page=100",
            headers=self.headers,
            timeout=10,
        )
        response.raise_for_status()
        return response.json()['data']

paystack_client = PaystackService()
