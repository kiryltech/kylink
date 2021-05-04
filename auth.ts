import * as express from "express";
import * as util from 'util'
import * as crypto from 'crypto'
import config from "./config";

const app = express();

const codeRegistry = {};
const refreshTokens = {};

const oauthConf = config().oauth;

app.use((req, res, next) => {
    const clientId = req.query.client_id ?
        req.query.client_id : req.body.client_id;
    if (oauthConf.clientId != clientId) {
        res.status(401).send('Unauthorized.');
        return;
    }
    next();
});

app.get('/', (req, res, next) => {
    if (req.query.p != oauthConf.secret) {
        res.status(401).send('Unauthorized.');
        return;
    }
    // @ts-ignore
    const redirectUrl = decodeURIComponent(req.query.redirect_uri);
    const code = crypto.randomBytes(128).toString('base64url');
    codeRegistry[code] = Date.now() + 60000;
    res.redirect(util.format('%s?code=%s&state=%s',
        redirectUrl, code,
        req.query.state));
});

function jsonToBase64(json) {
    return Buffer.from(JSON.stringify(json), 'ascii').toString('base64url');
}

function base64ToJson(base64) {
    return JSON.parse(Buffer.from(base64, 'base64url').toString('ascii'));
}

function sign(unsignedToken: string) {
    return crypto.createHmac('sha256', oauthConf.tokenSecret)
        .update(unsignedToken)
        .digest().toString('base64url');
}

function generateAccessToken() {
    const header = {
        alg: 'HS256',
        typ: 'JWT',
    };
    const payload = {
        accessLevel: ['smarthome'],
        iat: Date.now() / 1000,
    };
    const unsignedToken = jsonToBase64(header) + '.' + jsonToBase64(payload);
    return unsignedToken + '.' + sign(unsignedToken);
}

app.use('/token', (req, res) => {
    const grantType = req.query.grant_type ?
        req.query.grant_type : req.body.grant_type;
    if (grantType == 'authorization_code') {
        if (!req.body.code ||
            !(req.body.code in codeRegistry) ||
            codeRegistry[req.body.code] < Date.now()) {
            res.status(401).send('Unauthorized.');
            return;
        }
        delete codeRegistry[req.body.code];
        const refreshToken = crypto.randomBytes(128).toString('base64url');
        refreshTokens[refreshToken] = Date.now();
        res.status(200).json({
            token_type: 'bearer',
            access_token: generateAccessToken(),
            refresh_token: refreshToken,
            expires_in: oauthConf.tokenTTL,
        });
    } else if (grantType === 'refresh_token') {
        const refreshToken = req.query.refresh_token ?
            req.query.refresh_token : req.body.refresh_token;
        if (!(refreshToken in refreshTokens)) {
            res.status(401).send('Unauthorized.');
            return;
        }
        res.status(200).json({
            token_type: 'bearer',
            access_token: generateAccessToken(),
            expires_in: oauthConf.tokenTTL,
        });
    } else {
        res.status(400).send('Grant type is not supported.')
    }
});

app.get('/logout', (req, res) => {
    // @ts-ignore
    req.logout();
    req['session'] = null;
    res.redirect('/');
});

export default function auth() {
    return app;
}

export function validateToken(scope) {
    return function (req, res, next) {
        const authHeader = req.header('authorization');
        if (!authHeader.startsWith('Bearer')) {
            res.status(401).send('Unauthorized.');
            return;
        }
        const [_, token] = authHeader.split(' ', 2);
        if (!token) {
            res.status(401).send('Unauthorized.');
            return;
        }
        const [header, payload, signature] = token.split('.', 3);
        if (!signature || signature !== sign(header + '.' + payload)) {
            res.status(401).send('Unauthorized.');
            return;
        }
        const payloadJson = base64ToJson(payload);
        if (payloadJson.accessLevel.indexOf(scope) == -1) {
            res.status(401).send('Unauthorized.');
            return;
        }
        if (!payloadJson.iat || payloadJson.iat > Date.now() / 1000) {
            res.status(401).send('Invalid token.');
            return;
        }
        if (payloadJson.iat + oauthConf.tokenTTL < Date.now() / 1000) {
            res.status(401).send('Token has been expired.');
            return;
        }
        next();
    }
}