const fs = require('fs');

const files = [
    'frontend/app/admin/reports/page.tsx',
    'frontend/app/admin/analytics/page.tsx'
];

files.forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    // Replace fill="hsl(var(--...))" with fill="var(--...)"
    // and same for stroke
    code = code.replace(/hsl\(var\((--[^)]+)\)\)/g, 'var($1)');
    // But wait, there are also --muted-foreground which might be `#9ca3af`.
    fs.writeFileSync(file, code);
});
console.log("Colors fixed");
