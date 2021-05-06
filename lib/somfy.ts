import SocketPool from 'socket-pool';
import * as json from 'json-multi-parse'
import config from "./config";

let somfyConf = config().somfy;
const host = somfyConf.host
const port = somfyConf.port
const systemId = somfyConf.systemId
const pool = new SocketPool({
    connect: {host, port},
});
let cmdId = 1;

export async function sendCommand(cmd) {
    return pool.acquire().then(con =>
        new Promise((resolve, reject) => {
            con.write(JSON.stringify(cmd));
            con.on('data', data => {
                try {
                    json(data.toString())
                        .forEach(res => {
                            if (res.id === cmd.id) {
                                resolve(res.result);
                            }
                        });
                } catch (err) {
                    reject(err);
                } finally {
                    con.release();
                }
            });
        }));
}

export async function listDevices() {
    return await sendCommand({
        method: 'mylink.status.info',
        params: {
            targetID: '*.*',
            auth: systemId
        },
        id: cmdId++
    })
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
