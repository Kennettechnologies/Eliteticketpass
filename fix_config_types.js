const fs = require('fs');
let code = fs.readFileSync('frontend/app/admin/config/page.tsx', 'utf8');

// Fix FeesSection parsing
code = code.replace(
  /api\.get<PlatformFeeConfig>\("\/admin\/config\/"\)\.then\(r => \{ if \(r\.success && r\.data\) setCfg\(r\.data\); \}\);/,
  `api.get<any>("/admin/config/").then(r => {
      if (r.success && r.data) {
        setCfg({
          ...r.data,
          default_flat_fee: Number(r.data.default_flat_fee || 0),
          default_pct_fee: Number(r.data.default_pct_fee || 0),
          refund_window_days: Number(r.data.refund_window_days || 0)
        });
      }
    });`
);

// Fix MaintenanceSection parsing (enabled is string "True"/"False" from backend)
code = code.replace(
  /api\.get<MaintenanceConfig>\("\/admin\/config\/"\)\.then\(r => \{\n\s*if \(r\.success && r\.data\) setCfg\(r\.data\); setLoading\(false\);\n\s*\}\);/,
  `api.get<any>("/admin/config/").then(r => {
      if (r.success && r.data) {
        setCfg({
          ...r.data,
          enabled: String(r.data.enabled).toLowerCase() === 'true'
        });
      }
      setLoading(false);
    });`
);

fs.writeFileSync('frontend/app/admin/config/page.tsx', code);
console.log("Config parsing fixed");
