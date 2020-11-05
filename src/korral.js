const fs = require('fs');
const yaml = require('js-yaml');

const {kubeconfig} = require('./kubeconfig');
const {kubectl} = require('./kubectl');

const manifestsFilename = 'korral.yaml';
const manifestNamespace = 'monitoring';

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

    const kubeconfigYaml = yaml.safeDump(kubeconfig(spec.domain, spec.kubernetes.api));
    const {error} = await kubectl(kubeconfigYaml, manifestsYaml, verb, '-f', '-');
    if (error) {
        console.log(`Unable to ${verb} Korral: kubectl failed: ${error}`);
    }
}

async function install(event, context) {
    return perform('apply', event, context);
}

async function uninstall(event, context) {
    return perform('delete', event, context);
}

module.exports = {install, uninstall, KORRAL_NAMESPACE};
