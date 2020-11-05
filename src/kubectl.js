const {spawn} = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

function kubectl(kubeconfig, stdin, ...args) {
    const kubeconfigFilename = path.join(os.tmpdir(), `kubeconfig.${crypto.randomBytes(4).toString('hex')}`);
    fs.writeFileSync(kubeconfigFilename, kubeconfig);
    const kctl = spawn('kubectl',
        [`--kubeconfig=${kubeconfigFilename}`, ...args],
        {stdio: ['pipe', 'inherit', 'inherit']});
    kctl.stdin.write(stdin);
    kctl.stdin.end();
    return new Promise((resolve) => {
        kctl.on('error', error => resolve({error}));
        kctl.on('exit', (code) => {
            console.log(`kubectl exited with code ${code}`);
            if (code !== 0) resolve({error: `exit code ${code}`});
            else resolve({});
            fs.unlinkSync(kubeconfigFilename);
        });
    });
}

module.exports = {kubectl};
