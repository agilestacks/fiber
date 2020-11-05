const https = require('https');
const axios = require('axios');
const k8s = require('@kubernetes/client-node');

function kubeclient(config) {
    const kc = new k8s.KubeConfig();
    if (typeof config === 'string') kc.loadFromString(config);
    else kc.loadFromOptions(config);
    return kc.makeApiClient(k8s.CoreV1Api);
}

function axiosclient(setup) {
    const {endpoint, caCert: ca, clientCert: cert, clientKey: key, token} = setup;
    const httpsAgent = new https.Agent({ca, key, cert, keepAlive: true});
    const axiosConfig = {
        baseURL: endpoint,
        httpsAgent,
        timeout: 10000,
        validateStatus: () => true
    };
    if (token) axiosConfig.headers = {Authorization: `Bearer ${token}`};
    return axios.create(axiosConfig);
}

module.exports = {kubeclient, axiosclient};
