import config from './config'
import * as express from 'express'
import {createServer as createHttpsServer} from 'https'
import {createServer as createHttpServer} from 'http'
import {readFileSync} from 'fs'
import smarthome from './smarthome'
import {validateToken} from './auth-validation'

const app = express();
app.use(express.json());
app.use(express.urlencoded());

app.use('/smarthome', validateToken('smarthome'), smarthome());

function initServer(app) {
    if (config().https) {
        const options = {
            key: readFileSync(config().https.keyFile),
            cert: readFileSync(config().https.certFile)
        };
        return createHttpsServer(options, app);
    } else {
        return createHttpServer(app);
    }
}

const port = config().express.port;
initServer(app).listen(port, () => {
    console.log(`Server started at port ${port}.`);
});
