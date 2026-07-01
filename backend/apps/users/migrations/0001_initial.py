from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("auth", "0012_alter_user_first_name_max_length"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE TABLE IF NOT EXISTS sequence_counter (
                name VARCHAR(50) PRIMARY KEY,
                value BIGINT NOT NULL DEFAULT 0
            );
            """,
            reverse_sql="DROP TABLE IF EXISTS sequence_counter;",
        ),
        migrations.CreateModel(
            name="User",
            fields=[
                ("password", models.CharField(max_length=128, verbose_name="password")),
                ("last_login", models.DateTimeField(blank=True, null=True, verbose_name="last login")),
                ("is_superuser", models.BooleanField(default=False)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("email", models.EmailField(blank=True, max_length=254, null=True, unique=True)),
                ("phone", models.CharField(blank=True, max_length=20, null=True, unique=True)),
                ("role", models.CharField(choices=[("SUPER_ADMIN", "Super Admin"), ("ADMIN", "Admin"), ("ORGANIZER", "Organizer"), ("GATE_STAFF", "Gate Staff"), ("BUYER", "Buyer")], default="BUYER", max_length=20)),
                ("status", models.CharField(choices=[("ACTIVE", "Active"), ("SUSPENDED", "Suspended"), ("BANNED", "Banned"), ("PENDING_VERIFICATION", "Pending Verification")], default="PENDING_VERIFICATION", max_length=30)),
                ("first_name", models.CharField(blank=True, max_length=100)),
                ("last_name", models.CharField(blank=True, max_length=100)),
                ("display_name", models.CharField(blank=True, max_length=150)),
                ("avatar_url", models.URLField(blank=True, max_length=500)),
                ("bio", models.TextField(blank=True)),
                ("date_of_birth", models.DateField(blank=True, null=True)),
                ("country_code", models.CharField(default="KE", max_length=3)),
                ("city", models.CharField(blank=True, max_length=100)),
                ("timezone", models.CharField(default="Africa/Nairobi", max_length=50)),
                ("email_verified", models.BooleanField(default=False)),
                ("phone_verified", models.BooleanField(default=False)),
                ("email_verified_at", models.DateTimeField(blank=True, null=True)),
                ("phone_verified_at", models.DateTimeField(blank=True, null=True)),
                ("two_factor_enabled", models.BooleanField(default=False)),
                ("two_factor_secret", models.CharField(blank=True, max_length=64)),
                ("last_login_at", models.DateTimeField(blank=True, null=True)),
                ("last_login_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("failed_login_count", models.PositiveSmallIntegerField(default=0)),
                ("locked_until", models.DateTimeField(blank=True, null=True)),
                ("marketing_emails", models.BooleanField(default=True)),
                ("sms_notifications", models.BooleanField(default=True)),
                ("push_notifications", models.BooleanField(default=True)),
                ("language", models.CharField(default="en", max_length=10)),
                ("is_staff", models.BooleanField(default=False)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("deleted_at", models.DateTimeField(blank=True, null=True)),
                ("groups", models.ManyToManyField(blank=True, related_name="user_set", related_query_name="user", to="auth.group", verbose_name="groups")),
                ("user_permissions", models.ManyToManyField(blank=True, related_name="user_set", related_query_name="user", to="auth.permission", verbose_name="user permissions")),
            ],
            options={"db_table": "users"},
        ),
        migrations.AddIndex(model_name="user", index=models.Index(fields=["email"], name="users_email_idx")),
        migrations.AddIndex(model_name="user", index=models.Index(fields=["phone"], name="users_phone_idx")),
        migrations.AddIndex(model_name="user", index=models.Index(fields=["role"], name="users_role_idx")),
        migrations.AddIndex(model_name="user", index=models.Index(fields=["status"], name="users_status_idx")),
        migrations.CreateModel(
            name="UserSession",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("refresh_token_jti", models.CharField(max_length=255, unique=True)),
                ("device_info", models.CharField(blank=True, max_length=255)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=512)),
                ("expires_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sessions", to="users.user")),
            ],
            options={"db_table": "user_sessions"},
        ),
        migrations.CreateModel(
            name="OAuthAccount",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("provider", models.CharField(max_length=30)),
                ("provider_user_id", models.CharField(max_length=255)),
                ("access_token", models.TextField(blank=True)),
                ("refresh_token", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="oauth_accounts", to="users.user")),
            ],
            options={"db_table": "oauth_accounts", "unique_together": {("provider", "provider_user_id")}},
        ),
        migrations.CreateModel(
            name="OtpCode",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("otp_type", models.CharField(choices=[("phone_verify", "Phone Verify"), ("email_verify", "Email Verify"), ("login", "Login"), ("password_reset", "Password Reset")], max_length=20)),
                ("code", models.CharField(max_length=6)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("attempt_count", models.PositiveSmallIntegerField(default=0)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="otp_codes", to="users.user")),
            ],
            options={"db_table": "otp_codes"},
        ),
        migrations.CreateModel(
            name="PasswordResetToken",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("email", models.EmailField()),
                ("token", models.CharField(max_length=64, unique=True)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"db_table": "password_reset_tokens"},
        ),
    ]
