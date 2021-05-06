import {Socket} from 'net';
import * as debug from 'debug';
import * as json from 'json-multi-parse'
import config from "./config";

const LOG = debug('kylink:somfy');

let somfyConf = config().somfy;
const host = somfyConf.host;
const port = somfyConf.port;
const systemId = somfyConf.systemId;
const con = new Socket().connect(port, host);
const cmdReg = new Map();
con.on('data', data => {
    try {
        json(data.toString())
            .forEach(res => {
                if (cmdReg.has(res.id)) {
                    cmdReg.get(res.id)(res.result);
                    cmdReg.delete(res.id);
                }
            });
    } catch (err) {
        LOG(`Data '${data.toString()}' processing error: ${err}`);
    }
});
let cmdId = 1;

// TODO: make execution sequential
export async function sendCommand(cmd): Promise<any> {
    return new Promise((resolve) => {
        cmdReg.set(cmd.id, resolve);
        con.write(JSON.stringify(cmd));
        setTimeout(() => {
            if (cmdReg.has(cmd.id)) {
                cmdReg.get(cmd.id)(false);
                cmdReg.delete(cmd.id);
            }
        }, 5000)
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

export function toSomfyCommand(device, execution) {
    if (execution.command != 'action.devices.commands.OpenClose')
        throw "Unsupported operation."
    const method = execution.params.openPercent == 100
        ? 'mylink.move.up'
        : 'mylink.move.down'
    return {
        method,
        params: {
            targetID: device.id,
            auth: systemId
        },
        id: cmdId++,
    };
}
