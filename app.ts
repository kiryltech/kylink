import config from './config'
import * as express from 'express'
import {json, urlencoded} from 'body-parser'
import {createServer} from 'https'
import {readFileSync} from 'fs'
import smarthome from './smarthome'
import auth, {validateToken} from './auth'

const app = express();
app.use(json());
app.use(urlencoded());

app.use('/smarthome', validateToken('smarthome'), smarthome());
app.use('/auth', auth());

const options = {
    key: readFileSync(config().https.keyFile),
    cert: readFileSync(config().https.certFile)
};

const port = 9000;
createServer(options, app).listen(port, () => {
    console.log(`Server started at port ${port}.`);
});
