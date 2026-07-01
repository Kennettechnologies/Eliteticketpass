const fs = require('fs');
let code = fs.readFileSync('frontend/app/admin/config/page.tsx', 'utf8');

// Fix interface
code = code.replace(
  /interface Category \{ id: string; name: string; slug: string; color: string; icon\?: string; \}/,
  'interface Category { id: string; name: string; slug: string; color?: string; color_hex?: string; icon?: string; }'
);

// Fix POST body
code = code.replace(
  /const res = await api\.post<Category>\("\/admin\/categories\/", \{ name: newName\.trim\(\), color: newColor \}\);/,
  'const res = await api.post<Category>("/admin/categories/", { name: newName.trim(), color: newColor });'
);

// Fix background style
code = code.replace(
  /style=\{\{ background: cat\.color \}\}/,
  'style={{ background: cat.color || cat.color_hex }}'
);

fs.writeFileSync('frontend/app/admin/config/page.tsx', code);
console.log("Categories UI fixed");
