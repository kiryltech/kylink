import {Socket} from 'net';
import * as debug from 'debug';
import * as json from 'json-multi-parse'
import config from "./config";

const LOG = debug('kylink:somfy');

let somfyConf = config().somfy;
const host = somfyConf.host;
const port = somfyConf.port;
const systemId = somfyConf.systemId;
const cmdReg = new Map();
const con = new Socket().connect(port, host);
con.on('data', data => {
    try {
        json(data.toString())
            .forEach(res => {
                if (cmdReg.has(res.id)) {
                    cmdReg.get(res.id).resolve(res.result);
                    cmdReg.delete(res.id);
                }
            });
    } catch (err) {
        LOG(`Data '${data.toString()}' processing error: ${err}`);
    }
});
let cmdId = 1;

// TODO: make execution sequential
async function sendCommand(cmd): Promise<any> {
    return new Promise((resolve, reject) => {
        cmdReg.set(cmd.id, {resolve, reject});
        con.write(JSON.stringify(cmd));
        setTimeout(() => {
            if (cmdReg.has(cmd.id)) {
                cmdReg.get(cmd.id).reject("Timeout error.");
                cmdReg.delete(cmd.id);
            }
        }, 5000);
    });
}

export async function listDevices(): Promise<[any]> {
    return await sendCommand({
        method: 'mylink.status.info',
        params: {
            targetID: '*.*',
            auth: systemId
        },
        id: cmdId++
    });
}

export async function stop(deviceId: string): Promise<any> {
    return await sendCommand({
        method: 'mylink.move.stop',
        params: {
            targetID: deviceId,
            auth: systemId
        },
        id: cmdId++
    });
}

export async function move(deviceId, openRelativePercent) {
    const method = openRelativePercent < 0
        ? 'mylink.move.down'
        : 'mylink.move.up';
    return await sendCommand({
        method,
        params: {
            targetID: deviceId,
            auth: systemId,
        },
        id: cmdId++,
    });
}
