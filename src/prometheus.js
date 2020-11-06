const {cloneDeep, get, isEqual, omit} = require('lodash');
const yaml = require('js-yaml');

const {KORRAL_NAMESPACE} = require('./korral');
const {dump} = require('./util');

const {
    PROMETHEUS_NAMESPACE,
    PROMETHEUS_RESOURCE,
    PROMETHEUS_NAME = 'prometheus-operator' // Prometheus name in Prometheus Operator resource (also Helm release name)
} = process.env;

const prometheusSecretName = 'additional-scrape-configs';
const prometheusSecretKey = 'prometheus-additional.yaml';
const scrapeConfigTemplate = {
    job_name: 'korral',
    scrape_interval: '5m',
    scrape_timeout: '20s',
    metrics_path: `/api/v1/namespaces/${KORRAL_NAMESPACE}/services/korral:9897/proxy/metrics`,
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

async function perform(verb, event, context, token) {
    const {object} = event;
    const {metadata} = object;
    const {operator, coreApi, api} = context;

    console.log(`${verb} Prometheus for ${metadata.name}`);

    const namespace = PROMETHEUS_NAMESPACE || metadata.namespace;
    const prometheusResourceName = PROMETHEUS_RESOURCE ||
        `${PROMETHEUS_NAME}-prometheus`;

    const prometheuses = operator.getCustomResourceApiUri('monitoring.coreos.com', 'v1', 'prometheuses', namespace);
    const prometheusResourceUri = `${prometheuses}/${prometheusResourceName}`;
    const {status, data: prometheusResource} = await api.get(prometheusResourceUri);
    dump({status, prometheusResource});

    if (status !== 200) {
        console.log(`Unable to ${verb} Prometheus: `
            + `no Prometheus Operator resource '${namespace}/${prometheusResourceName}' found`);
        return;
    }

    const {spec: {additionalScrapeConfigs: {name: secretNameCR, key: secretKeyCR} = {}}} = prometheusResource;
    dump({secretNameCR, secretKeyCR});

    const secretName = secretNameCR || prometheusSecretName;
    const secretKey = secretKeyCR || prometheusSecretKey;
    const patchPrometheus = !secretNameCR;

    const {body: existingSecret, error} = await coreApi.readNamespacedSecret(secretName, namespace)
        .catch(e => ({error: e}));
    dump({secretName, secretKey, existingSecret, error: get(error, 'response.body')});
    if (error) {
        if (error.response.body.code !== 404) {
            console.log(`Error retrieving Prometheus scrape configs '${namespace}/${secretName}':`);
            dump({error: error.response.body});
            return;
        }
    }
    const patchSecret = !error && existingSecret;
    if (verb === 'unconfigure' && !patchSecret) return;

    const {spec: {domain, kubernetes: {api: {endpoint}}}} = object;
    const {host, port} = new URL(endpoint);

    let configs = [];
    let setSecret = true;
    const jobName = `${scrapeConfigTemplate.job_name}/${domain}`;
    const comparator = ({job_name: k}) => k === jobName;
    const configsBlob = existingSecret ? (existingSecret.data || {})[secretKey] : null;
    if (configsBlob) {
        configs = yaml.safeLoad(Buffer.from(configsBlob, 'base64').toString());
    }

    if (verb === 'configure') {
        const job = cloneDeep(scrapeConfigTemplate);
        job.job_name = jobName;
        job.static_configs[0].targets.push(`${host}:${port || 443}`);
        job.static_configs[0].labels.domain = domain;
        job.bearer_token = token;

        const existingJob = configs.find(comparator);
        if (isEqual(job, existingJob)) setSecret = false;
        else if (existingJob) configs = configs.filter(j => !comparator(j));

        configs = [...configs, job];
    } else {
        const before = configs.length;
        configs = configs.filter(j => !comparator(j));
        if (before === configs.length) setSecret = false;
    }

    if (setSecret) {
        configs = yaml.safeDump(configs);
        console.log(configs);

        const data = {data: {[secretKey]: Buffer.from(configs).toString('base64')}};
        dump(data);
        const {body: secret, error: error2} = await (patchSecret ?
            coreApi.patchNamespacedSecret(secretName, namespace, data,
                // https://github.com/kubernetes-client/javascript/pull/508/files
                undefined, undefined, undefined, undefined, patchOptions) :
            coreApi.createNamespacedSecret(namespace, {metadata: {name: secretName}, ...data}))
            .catch(e => ({error: e}));
        dump({secret, error: get(error2, 'response.body')});
    }

    if (patchPrometheus) {
        const patch = {spec: {additionalScrapeConfigs: {name: secretName, key: secretKey}}};
        const resp = await api.patch(prometheusResourceUri, patch, patchOptions);
        dump({resp: omit(resp, ['config', 'request'])});
    }
}

function configure(event, context, token) {
    return perform('configure', event, context, token);
}

function unconfigure(event, context) {
    return perform('unconfigure', event, context);
}

module.exports = {configure, unconfigure};
