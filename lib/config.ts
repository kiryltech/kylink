import * as YAML from 'yaml'
import {readFileSync} from "fs";

const config = YAML.parse(readFileSync('./app.yaml').toString());

if (config.express.debug) {
    process.env.DEBUG = config.express.debug;
}

export default function () {
    return config;
}
