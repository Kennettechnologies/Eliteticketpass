from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
import math


class StandardPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response({
            "success": True,
            "data": {"results": data},
            "error": None,
            "meta": {
                "count": self.page.paginator.count,
                "total_pages": math.ceil(self.page.paginator.count / self.get_page_size(self.request)),
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "page": self.page.number,
                "page_size": self.get_page_size(self.request),
            },
        })

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "success": {"type": "boolean"},
                "data": schema,
                "error": {"type": "string", "nullable": True},
                "meta": {
                    "type": "object",
                    "properties": {
                        "count": {"type": "integer"},
                        "total_pages": {"type": "integer"},
                        "next": {"type": "string", "nullable": True},
                        "previous": {"type": "string", "nullable": True},
                    },
                },
            },
        }
