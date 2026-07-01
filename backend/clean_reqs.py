import re

with open('requirements.txt', 'r') as f:
    lines = f.readlines()

keep = []
bad_keywords = [
    'Brlapi', 'cupshelpers', 'dasbus', 'dbus_next', 'langtable', 'louis', 
    'pyenchant', 'pyinotify', 'pyxdg', 'productmd', 'pwquality', 'sos', 
    'pykickstart', 'selinux', 'sepolicy', 'setools', 'simpleline', 'python-augeas',
    'python-bugzilla', 'python-linux-procfs', 'python-meh', 'python-pam', 
    'rpds-py', 'systemd-python', 'libcomps', 'libvirt-python', 'cockpit', 
    'PyGObject', 'pycairo', 'PyAudio', 'distro', 'Brlapi', 'fedora-third-party',
    'python-slugify', 'xkbregistry', 'systemd', 'nftables', 'blivet'
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
