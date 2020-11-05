const axios = require('axios');
const {default: Operator, ResourceEventType} = require('@dot-i/k8s-operator');

const {install: installKorral, uninstall: uninstallKorral} = require('./korral');
const {configure: configurePrometheus, unconfigure: unconfigurePrometheus} = require('./prometheus');
const {dump, trimVerbosity} = require('./util');

async function converge(event, context) {
    await Promise.all([installKorral, configurePrometheus].map(f => f(event, context)));
}

async function finalize(event, context) {
    const {operator} = context;
    const uninstalled = await operator.handleResourceFinalizer(event,
        'uninstall.korrals.kushion.agilestacks.com', ev => uninstallKorral(ev, context));
    const unconfigured = await operator.handleResourceFinalizer(event,
        'unconfigure.korrals.kushion.agilestacks.com', ev => unconfigurePrometheus(ev, context));
    return uninstalled || unconfigured;
}

async function watch(event, context) {
    dump(event);

    const {object} = event;
    const {metadata} = object;
    console.log(`${event.type} ${metadata.name}`);
    const diagnose = (e) => { console.log(trimVerbosity(e)); throw e; };
    switch (event.type) {
        case ResourceEventType.Added:
        case ResourceEventType.Modified: // eslint-disable-line no-fallthrough
            if (await finalize(event, context).catch(diagnose)) break;
            await converge(event, context).catch(diagnose);
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
        const {k8sApi: coreApi} = this;
        const kubeAuth = {};
        await this.applyAxiosKubeConfigAuth(kubeAuth);
        const api = axios.create({
            timeout: 10000,
            validateStatus: () => true,
            ...kubeAuth
        });

        const context = {operator: this, coreApi, api};
        await this.watchResource('kushion.agilestacks.com', 'v1', 'korrals',
            async event => watch(event, context));
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
