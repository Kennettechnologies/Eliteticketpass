const fs = require('fs');

const files = [
    'frontend/app/admin/reports/page.tsx',
    'frontend/app/admin/analytics/page.tsx'
];

files.forEach(file => {
    if (fs.existsSync(file)) {
        let code = fs.readFileSync(file, 'utf8');
        
        // 1. Fix Smart Summary text color
        // Originally: text-primary-foreground/80
        // Change to: text-foreground
        code = code.replace(/text-primary-foreground\/80/g, 'text-foreground');
        
        // 2. Fix X and Y axis tick colors
        // Originally: var(--muted-foreground)
        // Change to: var(--muted) or var(--foreground) (foreground is brighter, user asked for "bright too")
        code = code.replace(/var\(--muted-foreground\)/g, 'var(--foreground)');
        
        // 3. Just in case there are any hsl(var(--muted-foreground)) left
        code = code.replace(/hsl\(var\(--muted-foreground\)\)/g, 'var(--foreground)');
        
        fs.writeFileSync(file, code);
    }
});
console.log("Colors fixed");
