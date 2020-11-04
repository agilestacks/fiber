const {cloneDeep, get, isEqual, omit} = require('lodash');
const axios = require('axios');
const yaml = require('js-yaml');
const {default: Operator, ResourceEventType} = require('@dot-i/k8s-operator');

const {dump, trimAxiosVerbosity} = require('./util');

async function installKorral(event, context) {
    const {object} = event;
    const {metadata} = object;
    console.log(`Installing Korral for ${metadata.name}`);
}

const {
    PROMETHEUS_NAMESPACE,
    PROMETHEUS_RESOURCE,
    PROMETHEUS_NAME = 'prometheus',
    KORRAL_NAMESPACE = 'monitoring'
} = process.env;

const prometheusSecretName = 'additional-scrape-configs';
const prometheusSecretKey = 'prometheus-additional.yaml';
const scrapeConfigTemplate = {
    job_name: 'korral',
    scrape_interval: '5m',
    scrape_timeout: '20s',
    metrics_path: `/api/v1/namespaces/${KORRAL_NAMESPACE}/services/korral:9797/proxy/metrics`,
    scheme: 'https',
    tls_config: {
        insecure_skip_verify: true
    },
    bearer_token: '',
    static_configs: [{
        targets: [], // host:port
        labels: {
            domain: ''
        }
    }]
};
const patchOptions = {headers: {'content-type': 'application/merge-patch+json'}};

async function configurePrometheus(event, context) {
    const {object} = event;
    const {metadata} = object;
    const {operator, api} = context;
    const {k8sApi} = operator;

    console.log(`Configuring Prometheus for ${metadata.name}`);

    const namespace = PROMETHEUS_NAMESPACE || metadata.namespace;
    const prometheusResourceName = PROMETHEUS_RESOURCE ||
        `prometheus-operator-${PROMETHEUS_NAME}`;

    const prometheuses = operator.getCustomResourceApiUri('monitoring.coreos.com', 'v1', 'prometheuses', namespace);
    const prometheusResourceUri = `${prometheuses}/${prometheusResourceName}`;
    const {status, data: prometheusResource} = await api.get(prometheusResourceUri);
    dump({status, prometheusResource});

    if (status !== 200) {
        console.log('Unable to configure Prometheus: '
            + `no Prometheus Operator resource '${namespace}/${prometheusResourceName}' found`);
        return;
    }

    const {spec: {additionalScrapeConfigs: {name: secretNameCR, key: secretKeyCR} = {}}} = prometheusResource;
    dump({secretNameCR, secretKeyCR});

    const secretName = secretNameCR || prometheusSecretName;
    const secretKey = secretKeyCR || prometheusSecretKey;
    const patchPrometheus = !secretNameCR;

    const {body: existingSecret, error} = await k8sApi.readNamespacedSecret(secretName, namespace)
        .catch(e => ({error: e}));
    dump({secretName, secretKey, existingSecret, error: get(error, 'response.body')});
    if (error) {
        if (error.response.body.code !== 404) {
            console.log(`Error retrieving Prometheus scrape configs '${namespace}/${secretName}':`);
            dump({error: error.response.body});
            return;
        }
    }
    const maybePatchSecret = !error && existingSecret;

    const {spec: {domain, kubernetes: {api: {endpoint, token}}}} = object;
    const {host, port} = new URL(endpoint);

    const job = cloneDeep(scrapeConfigTemplate);
    job.job_name = `${job.job_name}/${domain}`;
    job.static_configs[0].targets.push(`${host}:${port || 443}`);
    job.static_configs[0].labels.domain = domain;
    job.bearer_token = token;

    let configs = [];
    let skipSecret = false;
    if (maybePatchSecret) {
        const configsBlob = (existingSecret.data || {})[secretKey];
        if (configsBlob) {
            configs = yaml.safeLoad(
                Buffer.from(configsBlob, 'base64').toString(),
                {schema: yaml.SAFE_SCHEMA});
        }
        const comparator = ({job_name: k}) => k === job.job_name;
        const existingJob = configs.find(comparator);
        if (isEqual(job, existingJob)) skipSecret = true;
        else if (existingJob) configs = configs.filter(j => !comparator(j));
    }

    // TODO check if Prometheus is reconfigured if only secret is changed but not the Prometheus CR
    if (!skipSecret) {
        configs = [...configs, job];
        configs = yaml.dump(configs);
        console.log(configs);

        const data = {data: {[secretKey]: Buffer.from(configs).toString('base64')}};
        dump(data);
        const {body: secret, error: error2} = await (maybePatchSecret ?
            k8sApi.patchNamespacedSecret(secretName, namespace, data,
                // https://github.com/kubernetes-client/javascript/pull/508/files
                undefined, undefined, undefined, undefined, patchOptions) :
            k8sApi.createNamespacedSecret(namespace, {metadata: {name: secretName}, ...data}))
            .catch(e => ({error: e}));
        dump({secret, error: get(error2, 'response.body')});
    }

    if (patchPrometheus) {
        const patch = {spec: {additionalScrapeConfigs: {name: secretName, key: secretKey}}};
        const resp = await api.patch(prometheusResourceUri, patch, patchOptions);
        dump({resp: omit(resp, ['config', 'request'])});
    }
}

async function converge(event, context) {
    await Promise.all([installKorral, configurePrometheus].map(f => f(event, context)));
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

            // if (metadata.generation < 2 && !object.status) {
            //     await operator.setResourceStatus(event.meta, {status: `seen ${statusCounter += 1}`});
            // }

            await converge(event, context).catch((e) => { console.log(e); throw e; });
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
