import os

EXCLUDE_DIRS = {'.git', 'node_modules', '__pycache__', '.next', 'venv', 'env', 'postgres_data', 'migrations'}

def replace_in_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception:
        return

    # To avoid breaking database connections or celery queues entirely,
    # we will ONLY replace specific UI and text instances, OR we replace everything
    # but restore the DB URLs.
    
    # Actually, replacing `EliteTicketPass` -> `EliteTicketPass`
    # and `eliteticketpass` -> `eliteticketpass` is safe if we don't care about DB name changing for NEW setups.
    # But for existing setups, changing `celery.py` `app = Celery("eliteticketpass")` might break running workers.
    # We will do a pure string replace.
    new_content = content.replace("EliteTicketPass", "EliteTicketPass")
    new_content = new_content.replace("eliteticketpass", "eliteticketpass")
    new_content = new_content.replace("ELITETICKETPASS", "ELITETICKETPASS")
    
    # Revert DB URL if changed (to prevent DB connection loss)
    new_content = new_content.replace("postgresql://ticketbase:ticketbase_dev@localhost:5432/ticketbase", "postgresql://ticketbase:ticketbase_dev@localhost:5432/ticketbase")
    new_content = new_content.replace("POSTGRES_DB: ticketbase", "POSTGRES_DB: ticketbase")
    new_content = new_content.replace("POSTGRES_USER: ticketbase", "POSTGRES_USER: ticketbase")
    new_content = new_content.replace("${DB_PASSWORD:-ticketbase_dev}", "${DB_PASSWORD:-ticketbase_dev}")
    new_content = new_content.replace("pg_isready -U ticketbase", "pg_isready -U ticketbase")
    
    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated: {filepath}")

for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
    for file in files:
        if file.endswith(('.py', '.tsx', '.ts', '.js', '.json', '.html', '.md', '.yml', '.env', '.txt', 'sw.js')):
            replace_in_file(os.path.join(root, file))
