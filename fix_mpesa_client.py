import re

with open('backend/core/mpesa.py', 'r') as f:
    content = f.read()

replacement = """
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
"""

content = re.sub(r'    def __init__\(self\):.*?self\.base_url = [^\n]+', replacement.strip(), content, flags=re.DOTALL)

with open('backend/core/mpesa.py', 'w') as f:
    f.write(content)
print("Updated core/mpesa.py to use dynamic database properties!")
