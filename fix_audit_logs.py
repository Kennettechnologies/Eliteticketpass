import re

with open('backend/apps/admin_panel/views.py', 'r') as f:
    content = f.read()

replacement = """
@api_view(["GET"])
@permission_classes([IsAdminOrSuperAdmin])
def audit_logs(request):
    from django.db.models import Q
    qs = AuditLog.objects.select_related("user").order_by("-created_at")
    
    action_filter = request.query_params.get("action")
    if action_filter: 
        qs = qs.filter(action=action_filter)
        
    entity_filter = request.query_params.get("entity")
    if entity_filter:
        qs = qs.filter(entity__icontains=entity_filter)
        
    search = request.query_params.get("search")
    if search:
        qs = qs.filter(
            Q(user__email__icontains=search) | 
            Q(user__first_name__icontains=search) | 
            Q(user__last_name__icontains=search) |
            Q(entity_id__icontains=search)
        )
        
    date_from = request.query_params.get("from")
    if date_from:
        qs = qs.filter(created_at__gte=date_from)
        
    date_to = request.query_params.get("to")
    if date_to:
        qs = qs.filter(created_at__lte=f"{date_to}T23:59:59Z")

    paginator = StandardPagination()
    page = paginator.paginate_queryset(qs, request)
    data = [{
        "id": str(l.id), 
        "user_email": l.user.email if l.user else None,
        "user_id": str(l.user.id) if l.user else None,
        "action": l.action, 
        "entity": l.entity, 
        "entity_id": l.entity_id, 
        "old_value": l.old_value,
        "new_value": l.new_value,
        "metadata": l.metadata,
        "ip_address": l.ip_address,
        "user_agent": l.user_agent,
        "created_at": l.created_at
    } for l in page]
    return paginator.get_paginated_response(data)
"""

content = re.sub(
    r'@api_view\(\["GET"\]\)\n@permission_classes\(\[IsAdminOrSuperAdmin\]\)\ndef audit_logs\(request\):.*?(?=\n\n\n|\Z)', 
    replacement.strip('\n'), 
    content, 
    flags=re.DOTALL
)

with open('backend/apps/admin_panel/views.py', 'w') as f:
    f.write(content)
print("Updated audit_logs view to support full metadata and search filters")
