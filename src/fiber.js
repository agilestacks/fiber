const axios = require('axios');
const {default: Operator, ResourceEventType} = require('@dot-i/k8s-operator');
const {dump, trimAxiosVerbosity} = require('./util');

const {
    PROMETHEUS_NAMESPACE,
    PROMETHEUS_RESOURCE,
    PROMETHEUS_NAME
} = process.env;

async function converge(event, {operator, api}) {
    const {object} = event;
    const {metadata} = object;

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
}

async function uninstallKorral(event, context) {
    const {object} = event;
    const {metadata} = object;
    console.log(`Uninstalling Korral ${metadata.name}`);
}

async function unconfigurePrometheus(event, context) {
    const {object} = event;
    const {metadata} = object;
    console.log(`Unconfiguring Prometheus ${metadata.name}`);
}

async function finalize(event, context) {
    const {operator} = context;
    const uninstalled = await operator.handleResourceFinalizer(event,
        'uninstall.korrals.kushion.agilestacks.com', ev => uninstallKorral(ev, context));
    const unconfigured = await operator.handleResourceFinalizer(event,
        'unconfigure.korrals.kushion.agilestacks.com', ev => unconfigurePrometheus(ev, context));
    return uninstalled || unconfigured;
}

let statusCounter = 0;

async function watch(event, context) {
    const {operator} = context;

    dump(event);

    const {object} = event;
    const {metadata} = object;
    console.log(`${event.type} ${metadata.name}`);
    switch (event.type) {
        case ResourceEventType.Added:
        case ResourceEventType.Modified: // eslint-disable-line no-fallthrough
            if (await finalize(event, context)) break;

            if (metadata.generation < 2 && !object.status) {
                await operator.setResourceStatus(event.meta, {status: `seen ${statusCounter += 1}`});
            }

            await converge(event, context);
            break;

        case ResourceEventType.Deleted:
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
