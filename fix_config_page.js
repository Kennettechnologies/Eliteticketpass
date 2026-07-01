const fs = require('fs');
let code = fs.readFileSync('frontend/app/admin/config/page.tsx', 'utf8');

// Replace all specific API paths with the generic `/admin/config/`
code = code.replace(/\/admin\/config\/fees\//g, '/admin/config/');
code = code.replace(/\/admin\/config\/gateways\//g, '/admin/config/');
code = code.replace(/\/admin\/config\/providers\//g, '/admin/config/');
code = code.replace(/\/admin\/config\/policies\//g, '/admin/config/');
code = code.replace(/\/admin\/config\/maintenance\//g, '/admin/config/');

// But wait! If `api.get("/admin/config/")` returns the FULL flat dictionary,
// then `cfg` will contain everything! And when `api.patch("/admin/config/", cfg)` runs,
// it will send ONLY the fields present in that `cfg` state object.
// The backend `platform_config` does a loop over `request.data.items()` and updates only those keys.
// So sending a partial dictionary is perfectly fine!

fs.writeFileSync('frontend/app/admin/config/page.tsx', code);
console.log("Config page API paths fixed");
