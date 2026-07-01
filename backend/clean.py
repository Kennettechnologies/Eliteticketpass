import re

with open('requirements.txt', 'r') as f:
    lines = f.readlines()

keep = []
bad_keywords = [
    'pyparted', 'pyudev'
]

for line in lines:
    line = line.strip()
    if not line:
        continue
        
    is_bad = False
    pkg_name = re.split(r'==|>=|<=|@', line)[0].strip()
    
    for bad in bad_keywords:
        if pkg_name.lower() == bad.lower():
            is_bad = True
            break
            
    if not is_bad:
        keep.append(line)

with open('requirements.txt', 'w') as f:
    f.write('\n'.join(keep) + '\n')
