const fs = require('fs');
let code = fs.readFileSync('frontend/app/admin/reports/page.tsx', 'utf8');

const leftoverStart = `        extra={
          <div>
            <label className="block text-xs text-muted mb-1">Organizer filter</label>`;
            
const leftoverEnd = `    </div>
  );
}`;

const startIndex = code.indexOf(leftoverStart);
const endIndex = code.indexOf(leftoverEnd, startIndex) + leftoverEnd.length;

if (startIndex !== -1 && endIndex !== -1) {
    code = code.slice(0, startIndex) + code.slice(endIndex);
    fs.writeFileSync('frontend/app/admin/reports/page.tsx', code);
    console.log("Leftover removed successfully");
} else {
    console.log("Leftover not found");
}
