import * as crypto from 'crypto'
import config from "./config";
import * as debug from 'debug'

const LOG = debug('kylink:auth');

const oauthConf = config().oauth;

function base64ToJson(base64) {
    return JSON.parse(Buffer.from(base64, 'base64url').toString('ascii'));
}

function sign(unsignedToken: string) {
    return crypto.createHmac('sha256', oauthConf.tokenSecret)
        .update(unsignedToken)
        .digest().toString('base64url');
}

export function validateToken(scope) {
    return function (req, res, next) {
        const authHeader = req.header('authorization');
        if (!authHeader.startsWith('Bearer')) {
            LOG(`Authorization header should start with "Bearer": ${authHeader}`);
            res.status(401).send('Unauthorized.');
            return;
        }
        const [, token] = authHeader.split(' ', 2);
        if (!token) {
            LOG(`Token extraction error, authorization header: ${authHeader}`);
            res.status(401).send('Unauthorized.');
            return;
        }
        const [header, payload, signature] = token.split('.', 3);
        if (!signature || signature !== sign(header + '.' + payload)) {
            LOG(`Token signature verification error: ${token}`);
            res.status(401).send('Unauthorized.');
            return;
        }
        const payloadJson = base64ToJson(payload);
        if (payloadJson.accessLevel.indexOf(scope) == -1) {
            LOG(`Access to scope "${scope}" is not allowed: ${payloadJson.accessLevel}`);
            res.status(401).send('Unauthorized.');
            return;
        }
        if (!payloadJson.iat || payloadJson.iat > Date.now() / 1000) {
            LOG(`Token timestamp is from the future: ${payloadJson.iat}`);
            res.status(401).send('Invalid token.');
            return;
        }
        if (payloadJson.iat + oauthConf.tokenTTL < Date.now() / 1000) {
            LOG(`Token has been expired.`);
            res.status(401).send('Token has been expired.');
            return;
        }
        LOG(`Token verification passed!`);
        next();
    }
}