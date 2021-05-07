import {smarthome, SmartHomeV1ExecuteRequest, SmartHomeV1ExecuteRequestCommands} from "actions-on-google";
import * as somfy from "./somfy";
import {Tedis, TedisPool} from "tedis";

const TIME_TO_FULL_CLOSE_MILLIS = 20000;

const tedisPool = new TedisPool();
const home = smarthome();

home.onSync(async (body) => {
    let somfyDevices = await somfy.listDevices();
    return {
        requestId: body.requestId,
        payload: {
            agentUserId: '123',
            devices: somfyDevices.map(device => ({
                id: device.targetID,
                type: 'action.devices.types.BLINDS',
                traits: [
                    'action.devices.traits.OpenClose',
                ],
                name: {
                    defaultNames: [device.name],
                    name: device.name,
                    nicknames: [device.name],
                },
                deviceInfo: {
                    manufacturer: 'Somfy',
                    model: 'MyLink',
                    hwVersion: '1.0',
                    swVersion: '1.0.0',
                },
                willReportState: false,
                attributes: {
                    openDirection: ['UP', 'DOWN'],
                    commandOnlyOpenClose: true
                },
            })),
        },
    };
});

home.onQuery(async (body) => {
    const tedis = await tedisPool.getTedis();
    try {
        const devices = {};
        for (const i in body.inputs[0].payload.devices) {
            const dev = body.inputs[0].payload.devices[i];
            devices[dev.id] = {
                openPercent: parseInt(await tedis.hget(
                    `kylink:somfy:${dev.id}`,
                    'openPercent')),
            }
        }
        return {
            requestId: body.requestId,
            payload: {devices}
        };
    } finally {
        tedisPool.putTedis(tedis);
    }
});

function individualize(commands: SmartHomeV1ExecuteRequestCommands[]) {
    return commands.flatMap(cmd =>
        cmd.devices.flatMap(device =>
            cmd.execution.map(execution =>
                ({device, execution})
            )
        )
    );
}

async function execute(body: SmartHomeV1ExecuteRequest, tedis: Tedis) {
    const commands = [];
    const deviceExecution = individualize(body.inputs[0].payload.commands);
    for (const i in deviceExecution) {
        if (deviceExecution[i].execution.command != 'action.devices.commands.OpenClose')
            throw "Unsupported operation."
        const deviceId = deviceExecution[i].device.id;
        const desiredOpenness = deviceExecution[i].execution.params.openPercent;
        const currentOpenness = parseInt(await tedis.hget(
            `kylink:somfy:${deviceId}`,
            'openPercent'));
        const openRelativePercent = desiredOpenness - currentOpenness;
        const res = await somfy.move(deviceId, openRelativePercent);
        if (res) {
            await tedis.hset(`kylink:somfy:${deviceId}`,
                'openPercent', deviceExecution[i].execution.params.openPercent);
        }
        commands.push({
            ids: [deviceId],
            status: res ? 'SUCCESS' : 'ERROR',
        });
        const fraction = Math.abs(openRelativePercent) / 100;
        if (desiredOpenness != 0 && desiredOpenness != 100) {
            setTimeout(() => {
                somfy.stop(deviceId);
            }, TIME_TO_FULL_CLOSE_MILLIS * fraction);
        }
    }
    return commands;
}

home.onExecute(async (body) => {
    const tedis = await tedisPool.getTedis();
    try {
        const commands = await execute(body, tedis);
        return {
            requestId: body.requestId,
            payload: {commands}
        };
    } finally {
        tedisPool.putTedis(tedis);
    }
});

home.onDisconnect(() => {
    return {};
});

export default function () {
    return home;
}