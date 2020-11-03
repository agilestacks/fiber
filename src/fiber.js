/* eslint-disable no-case-declarations */
const axios = require('axios');
const {default: Operator, ResourceEventType} = require('@dot-i/k8s-operator');
const {dump, trimAxiosVerbosity} = require('./util');

const {
    PROMETHEUS_NAMESPACE,
    PROMETHEUS_RESOURCE,
    PROMETHEUS_NAME
} = process.env;

async function resourceDeleted(event) {
    console.log('=== Deleting');
    dump(event);
}

let statusCounter = 0;

async function watch(event, context) {
    const {operator, api} = context;

    dump(event);

    const {object} = event;
    const {metadata} = object;
    switch (event.type) {
        case ResourceEventType.Added:
            console.log('=== Added');

        case ResourceEventType.Modified: // eslint-disable-line no-fallthrough
            if (await operator.handleResourceFinalizer(event, 'clusters.kushion.agilestacks.com',
                resourceDeleted)) break;

            if (metadata.generation < 2 && !object.status) {
                await operator.setResourceStatus(event.meta, {status: `seen ${statusCounter += 1}`});
            }

            const namespace = PROMETHEUS_NAMESPACE || metadata.namespace;
            const prometheusResourceName = PROMETHEUS_RESOURCE ||
                `prometheus-operator-${PROMETHEUS_NAME || 'prometheus'}`;

            const promUrl = operator.getCustomResourceApiUri('monitoring.coreos.com', 'v1', 'prometheuses', namespace);
            const {status, data: prometheusResource} = await api.get(`${promUrl}/${prometheusResourceName}`);
            dump({status, prometheusResource});
            const {spec: {additionalScrapeConfigs: {name: secretName, key: secretKey} = {}}} = prometheusResource;
            dump({secretName, secretKey});

            if (secretName) {
                const {body: secret, error} = await operator.k8sApi.readNamespacedSecret(secretName, namespace)
                    .catch(e => ({error: e}));
                dump({secretName, secretKey, secret, error: error.response.body});
            }
            break;

        case ResourceEventType.Deleted:
            console.log('=== Deleted');
            break;

        default:
            console.log(`Unknown event ${event.type}:`);
            dump(event);
            process.exit(1);
    }
}

class Fiber extends Operator {
    async init() {
        const kubeAuth = {};
        await this.applyAxiosKubeConfigAuth(kubeAuth);
        const api = axios.create({
            timeout: 10000,
            validateStatus: () => true,
            ...kubeAuth
        });

        const context = {operator: this, api};
        await this.watchResource('kushion.agilestacks.com', 'v1', 'korrals',
            async event => watch(event, context).catch((e) => { throw trimAxiosVerbosity(e); }));
    }
}

async function main() {
    const operator = new Fiber();

    const signal = (reason) => {
        console.log(`\nExiting on ${reason}`);
        operator.stop();
        process.exit(0);
    };

    process
        .on('SIGTERM', () => signal('SIGTERM'))
        .on('SIGINT', () => signal('SIGINT'));

    await operator.start();
}

main();
