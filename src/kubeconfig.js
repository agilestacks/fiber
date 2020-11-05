function maybeEncode(key) {
    if (key.startsWith('-----')) return Buffer.from(key).toString('base64');
    return key;
}

function kubeconfig(name, setup) {
    const {endpoint, caCert, clientCert, clientKey, token} = setup;
    return {
        apiVersion: 'v1',
        kind: 'Config',
        clusters: [{
            name,
            cluster: {
                server: endpoint,
                'certificate-authority-data': maybeEncode(caCert)
            }
        }],
        contexts: [{
            name,
            context: {
                cluster: name,
                namespace: 'kube-system',
                user: 'admin'
            }
        }],
        'current-context': name,
        users: [{
            name: 'admin',
            user: {
                ...(token ? {token} : {}),
                ...(clientCert && clientKey ? {
                    'client-certificate-data': maybeEncode(clientCert),
                    'client-key-data': maybeEncode(clientKey)
                } : {})
            }
        }]
    };
}

module.exports = {kubeconfig};
