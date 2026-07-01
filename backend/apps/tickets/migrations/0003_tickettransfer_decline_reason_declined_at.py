from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('tickets', '0002_alter_qr_code_url_to_textfield'),
    ]

    operations = [
        migrations.AddField(
            model_name='tickettransfer',
            name='decline_reason',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='tickettransfer',
            name='declined_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
