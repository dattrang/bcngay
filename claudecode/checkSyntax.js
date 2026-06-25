const fs = require('fs');
const code = fs.readFileSync('QLVB.html', 'utf8');
const scripts = Array.from(code.matchAll(/<script[\s\S]*?>([\s\S]*?)<\/script>/g)).map(m => m[1]);
const vm = require('vm');
scripts.forEach((s, i) => {
    try {
        new vm.Script(s);
        console.log(`Script ${i} OK`);
    } catch(e) {
        console.error(`Script ${i} Error:`, e);
    }
});
