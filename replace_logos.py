import os
import re

def replacer(path, repl, max_height_class):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return
        
    # The pattern matches:
    # <div className="... bg-gold-gradient ..."> ... <Ticket ... /> ... </div> ... <span className="... gold-text ...">EliteTicketPass...</span>
    
    pattern = re.compile(r'<div[^>]*bg-gold-gradient[^>]*>.*?</div>\s*<span[^>]*gold-text[^>]*>EliteTicketPass(?: Admin)?</span>', re.DOTALL)
    
    new_content = pattern.sub(repl, content)
    
    if new_content != content:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Replaced logo in {path}")

# Navbar
replacer('frontend/components/layout/navbar.tsx', '<img src="/logo.png" alt="EliteTicketPass Logo" className="h-8 w-auto object-contain" />', 'h-8')

# Footer
replacer('frontend/components/layout/footer.tsx', '<img src="/logo.png" alt="EliteTicketPass Logo" className="h-8 w-auto object-contain" />', 'h-8')

# Admin Layout
replacer('frontend/app/admin/layout.tsx', '<img src="/logo.png" alt="EliteTicketPass Admin" className="h-8 w-auto object-contain" />', 'h-8')

# Dashboard Layout
replacer('frontend/app/dashboard/layout.tsx', '<img src="/logo.png" alt="EliteTicketPass Dashboard" className="h-8 w-auto object-contain" />', 'h-8')

# Auth pages
for p in ['login/page.tsx', 'register/page.tsx', 'magic-link/page.tsx']:
    replacer(f'frontend/app/auth/{p}', '<img src="/logo.png" alt="EliteTicketPass Logo" className="h-10 w-auto object-contain mx-auto" />', 'h-10')
