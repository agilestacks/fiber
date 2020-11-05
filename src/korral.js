const fs = require('fs');
const yaml = require('js-yaml');

const {kubeconfig} = require('./kubeconfig');
const {kubeclient} = require('./kubernetes');
const {kubectl} = require('./kubectl');
const {retry} = require('./util');

const manifestsFilename = 'korral.yaml';
const manifestNamespace = 'monitoring';
const manifestServiceAccount = 'korral';

const {
    KORRAL_NAMESPACE = manifestNamespace
} = process.env;

const namespaceYaml = yaml.safeDump({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
        name: KORRAL_NAMESPACE
    }
});

async function perform(verb, event) {
    const {object} = event;
    const {metadata, spec} = object;
    const namespace = KORRAL_NAMESPACE;

    console.log(`${verb} Korral for ${metadata.name}`);

    let manifestsYaml = fs.readFileSync(manifestsFilename, 'utf8');
    if (manifestNamespace !== namespace) {
        const manifests = yaml.safeLoadAll(manifestsYaml);
        // eslint-disable-next-line no-param-reassign
        manifests.forEach(({metadata: m}) => { if (m.namespace) m.namespace = namespace; });
        manifestsYaml = manifests.map(yaml.safeDump).join('---\n');
    }
    if (verb === 'apply') {
        manifestsYaml = namespaceYaml
            + (manifestsYaml.startsWith('---') ? '' : '---\n')
            + manifestsYaml;
    }

    const kconf = kubeconfig(spec.domain, spec.kubernetes.api);
    const kconfYaml = yaml.safeDump(kconf);
    const {error} = await kubectl(kconfYaml, manifestsYaml, verb, '-f', '-');
    if (error) {
        console.log(`Unable to ${verb} Korral: kubectl failed: ${error}`);
    }

    if (verb === 'apply') {
        const api = kubeclient(kconfYaml);
        const token = await retry(async () => {
            const {body: serviceAccount} = await api.readNamespacedServiceAccount(manifestServiceAccount, namespace);
            const secretName = serviceAccount.secrets.find(({name}) => name.includes('token')).name;
            const {body: secret} = await api.readNamespacedSecret(secretName, namespace);
            return Buffer.from(secret.data.token, 'base64').toString();
        });
        return {token};
    }

    return {};
}

async function install(event, context) {
    return perform('apply', event, context);
}

async function uninstall(event, context) {
    return perform('delete', event, context);
}

module.exports = {install, uninstall, KORRAL_NAMESPACE};
