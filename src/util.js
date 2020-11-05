const util = require('util');
const {pick} = require('lodash');

function noop() {
    return undefined;
}

function dump(obj) {
    console.log(util.inspect(obj, {depth: 10, showHidden: false}));
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function retry(func, wait = 1, count = 10) {
    let err;
    for (let i = 0; i < count; i += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const result = await func();
            return result;
        } catch (e) {
            // eslint-disable-next-line no-await-in-loop
            if (i < count + 1) await sleep(wait * 1000);
            err = e;
        }
    }
    throw err;
}

function trimVerbosity(error) {
    if (error.isAxiosError) {
        return pick(error, ['message', 'reason', 'code',
            'config.url', 'config.baseURL', 'config.timeout',
            'request.method', 'request.path',
            'response.status', 'response.statusText', 'response.data']);
    }
    return error;
}

module.exports = {noop, dump, sleep, retry, trimVerbosity};
