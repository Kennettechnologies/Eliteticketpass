import io
import uuid
import base64
import logging
from celery import shared_task
from django.db import transaction
from django.db.models import F
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(name="tickets.issue_tickets_for_order", bind=True, max_retries=3, queue="tickets")
def issue_tickets_for_order(self, order_id: str):
    """
    Idempotent: skips if tickets already exist.
    Issues one ticket per quantity item, generates QR, uploads to storage.
    """
    from apps.orders.models import Order, OrderItem
    from apps.events.models import TicketTier
    from .models import Ticket
    from core.utils import generate_ticket_number

    try:
        with transaction.atomic():
            order = Order.objects.select_for_update().get(id=order_id)

            if order.tickets.exists():
                logger.info(f"Tickets already issued for order {order_id}, skipping.")
                return

            items = OrderItem.objects.filter(order=order).select_related("tier")
            tickets_to_create = []

            for item in items:
                for _ in range(item.quantity):
                    ticket_number = generate_ticket_number()
                    qr_token = uuid.uuid4()
                    qr_b64 = _generate_qr_b64(str(qr_token))

                    tickets_to_create.append(Ticket(
                        order=order,
                        user=order.user,
                        tier=item.tier,
                        ticket_number=ticket_number,
                        qr_token=qr_token,
                        qr_code_url=f"data:image/png;base64,{qr_b64}",
                        holder_name=f"{order.buyer_first_name} {order.buyer_last_name}".strip() or "Guest",
                        holder_email=order.buyer_email,
                        holder_phone=order.buyer_phone,
                        status=Ticket.Status.ACTIVE,
                    ))

            Ticket.objects.bulk_create(tickets_to_create)

            # Increment sold, decrement reserved
            for item in items:
                TicketTier.objects.filter(id=item.tier_id).update(
                    sold=F("sold") + item.quantity,
                    reserved=F("reserved") - item.quantity,
                )

            order.status = Order.Status.CONFIRMED
            order.confirmed_at = timezone.now()

            # Automatic IP Geolocation Fallback
            if not order.buyer_city and order.ip_address and order.ip_address not in ("127.0.0.1", "::1"):
                try:
                    import requests
                    res = requests.get(f"http://ip-api.com/json/{order.ip_address}", timeout=3).json()
                    if res.get("status") == "success" and res.get("city"):
                        order.buyer_city = res["city"]
                        logger.info(f"Geolocated order {order_id} to {res['city']}")
                except Exception as e:
                    logger.warning(f"IP Geolocation failed for {order.ip_address}: {e}")

            order.save(update_fields=["status", "confirmed_at", "buyer_city"])

            if order.promo_code_id:
                from apps.promos.models import PromoCode, PromoCodeUsage
                PromoCodeUsage.objects.create(
                    promo_code_id=order.promo_code_id,
                    order=order,
                    user=order.user,
                    discount_amount=order.discount_amount
                )
                PromoCode.objects.filter(id=order.promo_code_id).update(usage_count=F("usage_count") + 1)
                
                # Deactivate if limit reached
                promo = PromoCode.objects.get(id=order.promo_code_id)
                if promo.usage_limit and promo.usage_count >= promo.usage_limit:
                    promo.is_active = False
                    promo.save(update_fields=["is_active"])

        # Fire confirmation email
        from apps.notifications.tasks import send_ticket_confirmation_email
        send_ticket_confirmation_email.delay(order_id)
        logger.info(f"Issued {len(tickets_to_create)} tickets for order {order_id}")

    except Exception as exc:
        logger.exception(f"Failed to issue tickets for order {order_id}")
        raise self.retry(exc=exc, countdown=30)


def _generate_qr_b64(token: str) -> str:
    """Generate a QR code PNG and return as base64 string."""
    try:
        import qrcode
        from PIL import Image
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(token)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()
    except ImportError:
        return ""


@shared_task(name="tickets.release_held_quantity", queue="tickets")
def release_held_quantity(order_id: str):
    """Release reserved quantities for an expired PENDING order."""
    from apps.orders.models import Order, OrderItem
    from apps.events.models import TicketTier

    try:
        with transaction.atomic():
            order = Order.objects.select_for_update().get(id=order_id, status=Order.Status.PENDING)
            items = OrderItem.objects.filter(order=order)
            for item in items:
                TicketTier.objects.filter(id=item.tier_id).update(
                    reserved=F("reserved") - item.quantity
                )
            order.status = Order.Status.CANCELLED
            order.cancel_reason = "Hold expired"
            order.cancelled_at = timezone.now()
            order.save(update_fields=["status", "cancel_reason", "cancelled_at"])
            logger.info(f"Released held quantity for order {order_id}")
    except Order.DoesNotExist:
        pass
    except Exception:
        logger.exception(f"Failed to release held quantity for order {order_id}")


@shared_task(name="tickets.generate_ticket_pdf", queue="tickets")
def generate_ticket_pdf(ticket_id: str) -> str:
    """Generate PDF ticket using reportlab. Returns base64-encoded PDF."""
    from .models import Ticket
    try:
        ticket = Ticket.objects.select_related("tier__event__organizer", "order").get(id=ticket_id)
        pdf_bytes = _build_pdf(ticket)
        return base64.b64encode(pdf_bytes).decode()
    except Exception:
        logger.exception(f"Failed to generate PDF for ticket {ticket_id}")
        return ""


def _build_pdf(ticket) -> bytes:
    """Build PDF ticket using reportlab."""
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, HRFlowable, Flowable, KeepTogether
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER, TA_LEFT
        import qrcode
        import requests

        class VerticalText(Flowable):
            def __init__(self, text, width, height, fontName="Helvetica", fontSize=10, textColor=colors.black):
                super().__init__()
                self.text = text
                self.width = width
                self.height = height
                self.fontName = fontName
                self.fontSize = fontSize
                self.textColor = textColor

            def draw(self):
                canvas = self.canv
                canvas.saveState()
                canvas.translate(self.width/2, 0)
                canvas.rotate(90)
                canvas.setFont(self.fontName, self.fontSize)
                canvas.setFillColor(self.textColor)
                canvas.drawString(0, 0, self.text)
                canvas.restoreState()

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, rightMargin=15*mm, leftMargin=15*mm, topMargin=20*mm, bottomMargin=20*mm)
        styles = getSampleStyleSheet()
        
        red_header_style = ParagraphStyle("RedHeader", parent=styles["Normal"], fontSize=14, textColor=colors.HexColor("#D32F2F"), alignment=TA_CENTER, spaceAfter=20)
        label_style = ParagraphStyle("TicketLabel", parent=styles["Normal"], fontSize=8, textColor=colors.HexColor("#9CA3AF"), spaceAfter=2, fontName="Helvetica-Bold", textTransform="uppercase")
        value_style = ParagraphStyle("TicketValue", parent=styles["Normal"], fontSize=11, textColor=colors.black, spaceAfter=0)
        title_style = ParagraphStyle("TicketTitle", parent=styles["Heading1"], fontSize=16, leading=20, textColor=colors.black, spaceAfter=4, fontName="Times-Bold")
        tier_style = ParagraphStyle("TierStyle", parent=styles["Normal"], fontSize=12, fontName="Helvetica-Bold", textColor=colors.black, alignment=TA_LEFT)
        tc_title_style = ParagraphStyle("TCTitle", parent=styles["Normal"], fontSize=10, fontName="Helvetica-Bold", spaceAfter=4)
        tc_text_style = ParagraphStyle("TCText", parent=styles["Normal"], fontSize=7, leading=9, textColor=colors.black)
        
        story = []
        
        story.append(Paragraph("Bring this ticket with you to the event", red_header_style))
        
        event = ticket.tier.event if ticket.tier else None
        
        qr = qrcode.QRCode(version=1, box_size=10, border=1)
        qr.add_data(str(ticket.qr_token))
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        qr_buf = io.BytesIO()
        img.save(qr_buf, format="PNG")
        qr_buf.seek(0)
        qr_img = RLImage(qr_buf, width=32*mm, height=32*mm)
        
        cover_img_flowable = Spacer(60*mm, 80*mm)
        if event and event.cover_image_url:
            try:
                resp = requests.get(event.cover_image_url, timeout=5)
                if resp.status_code == 200:
                    img_buf = io.BytesIO(resp.content)
                    cover_img_flowable = RLImage(img_buf, width=60*mm, height=80*mm, kind='proportional')
            except Exception:
                pass
                
        left_data = [
            [cover_img_flowable],
            [Spacer(1, 4*mm)],
            [Paragraph("NAME", label_style)],
            [Paragraph(ticket.holder_name or "Guest", value_style)],
            [Spacer(1, 10*mm)],
            [Paragraph(ticket.tier.name if ticket.tier else "General", tier_style)]
        ]
        left_table = Table(left_data, colWidths=[63*mm])
        left_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('BOTTOMPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (-1,-1), 0),
            ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#FF8A80")), 
            ('PADDING', (0,-1), (-1,-1), 6),
        ]))
        
        date_str = event.starts_at.strftime("%Y-%m-%d %H:%M:%S") if event else ""
        end_str = f" - {event.ends_at.strftime('%Y-%m-%d %H:%M:%S')}" if event and event.ends_at else ""
        order_date = ticket.order.created_at.strftime("%a %d %b %Y %H:%M:%S") if ticket.order else ""
        order_id = ticket.order.order_number if ticket.order else "-"
        price_str = "Free Event" if (ticket.tier and ticket.tier.is_free) else f"Paid"
        
        mid_data = [
            [[Paragraph("EVENT", label_style), Paragraph(event.title if event else "Unknown", title_style)]],
            [[Paragraph("DATE & TIME", label_style), Paragraph(f"{date_str}{end_str}", value_style)]],
            [[Paragraph("LOCATION", label_style), Paragraph(f"{event.venue_name}, {event.venue_city}" if event else "", value_style)]],
            [[Paragraph("ORDER INFO", label_style), Paragraph(f"Ordered on <b>{order_date}</b><br/>Order ID: <b>{order_id}</b><br/><b>{price_str}</b>", value_style)]],
            [[Paragraph("TICKET ID", label_style), Paragraph(f"<b>{ticket.ticket_number}</b>", value_style)]],
            [[Paragraph("TICKET STATUS", label_style), Paragraph(f"<b>{ticket.status}</b>", value_style)]]
        ]
        mid_table = Table(mid_data, colWidths=[80*mm])
        mid_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LINEBELOW', (0,0), (-1,-2), 0.5, colors.HexColor("#D1D5DB")),
            ('LEFTPADDING', (0,0), (-1,-1), 4*mm),
            ('RIGHTPADDING', (0,0), (-1,-1), 4*mm),
            ('TOPPADDING', (0,0), (-1,-1), 4*mm),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4*mm),
        ]))
        
        vert_text = VerticalText("Ticket sold through EliteTicketPass", width=10*mm, height=80*mm, fontName="Helvetica-Bold", fontSize=12)
        right_data = [
            [Paragraph("Ticket sold through", ParagraphStyle("s", parent=styles["Normal"], fontSize=7, alignment=TA_CENTER))],
            [vert_text],
            [qr_img]
        ]
        right_table = Table(right_data, colWidths=[35*mm])
        right_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('ALIGN', (0,-1), (-1,-1), 'CENTER'),
            ('VALIGN', (0,-1), (-1,-1), 'BOTTOM'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ]))
        
        main_data = [[left_table, mid_table, right_table]]
        main_table = Table(main_data, colWidths=[65*mm, 80*mm, 35*mm])
        main_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#D1D5DB")),
            ('INNERGRID', (0,0), (-1,-1), 1, colors.HexColor("#D1D5DB")),
            ('PADDING', (0,0), (-1,-1), 0),
        ]))
        
        story.append(main_table)
        story.append(Spacer(1, 15*mm))
        
        tc_text = """
        &bull; Management reserves the right to admission at the event.<br/>
        &bull; Only tickets bought directly through EliteTicketPass shall be deemed valid.<br/>
        &bull; All sales are final. No cancellations, refunds or exchanges.<br/>
        &bull; You can print your ticket or come with it on your mobile phone.<br/>
        &bull; Please Note: Once the barcode has been scanned at the gate, it ceases to be valid.<br/>
        &bull; The holder of this ticket voluntarily assumes all risks incident to the event.
        """
        if event and getattr(event, 'ticket_terms', None):
            terms = [t.strip() for t in event.ticket_terms.split('\n') if t.strip()]
            if terms:
                tc_text = "<br/>".join([f"&bull; {t}" for t in terms])
        
        support_text = "<b>Email:</b> support@eliteticketpass.com<br/><b>Tel:</b> +254 700 000 000<br/><b>Address:</b> Nairobi, Kenya"
        if event and event.organizer:
            org = event.organizer
            parts = []
            if org.contact_email:
                parts.append(f"<b>Email:</b> {org.contact_email}")
            if org.contact_phone:
                parts.append(f"<b>Tel:</b> {org.contact_phone}")
            if getattr(org, 'contact_address', None):
                parts.append(f"<b>Address:</b> {org.contact_address}")
            if parts:
                support_text = "<br/>".join(parts)
        
        footer_data = [
            [
                [Paragraph("TERMS AND CONDITIONS", tc_title_style), Paragraph(tc_text, tc_text_style)],
                [Paragraph("SUPPORT", tc_title_style), Paragraph(support_text, tc_text_style)]
            ]
        ]
        footer_table = Table(footer_data, colWidths=[120*mm, 60*mm])
        footer_table.setStyle(TableStyle([
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LEFTPADDING', (0,0), (-1,-1), 0),
        ]))
        
        story.append(footer_table)
        
        doc.build(story)
        return buf.getvalue()
    except ImportError:
        return b""
    except Exception as e:
        logger.exception("Failed to build PDF")
        return b""
