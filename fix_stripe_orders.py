import re

with open('backend/apps/orders/views.py', 'r') as f:
    content = f.read()

replacement = """
                from apps.admin_panel.models import PlatformConfig
                stripe_conf = PlatformConfig.objects.filter(key="stripe_secret_key").first()
                stripe.api_key = stripe_conf.value if stripe_conf else django_settings.STRIPE_SECRET_KEY
"""

content = re.sub(r'                stripe\.api_key = django_settings\.STRIPE_SECRET_KEY', replacement.strip('\n'), content)

with open('backend/apps/orders/views.py', 'w') as f:
    f.write(content)
print("Updated orders/views.py to use dynamic Stripe key")
