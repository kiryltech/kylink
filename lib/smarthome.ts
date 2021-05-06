import {smarthome} from "actions-on-google";
import * as somfy from "./somfy";

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
                    discreteOnlyOpenClose: true,
                    openDirection: ['UP', 'DOWN'],
                    commandOnlyOpenClose: true
                },
            })),
        },
    };
});

home.onQuery((body) => {
    return {
        requestId: body.requestId,
        payload: {
            devices: body.inputs[0].payload.devices
                .reduce(
                    (res, device) =>
                        ({...res, [device.id]: {}}),
                    {}
                )
        }
    };
});

function toSomfyCommandList(cmd) {
    return cmd.devices.flatMap(device =>
        cmd.execution.map(execution =>
            somfy.toSomfyCommand(device, execution)
        )
    );
}

home.onExecute(async (body) => {
    let commands = body.inputs[0].payload.commands
        .flatMap(toSomfyCommandList);
    const result = [];
    for (let i in commands) {
        result.push(await somfy.sendCommand(commands[i]));
    }
    return {
        requestId: body.requestId,
        payload: {
            commands: result.map((rs, i) => ({
                ids: [commands[i].params.targetID],
                status: rs ? 'SUCCESS' : 'ERROR',
            }))
        }
    };
});

home.onDisconnect(() => {
    return {};
});

export default function () {
    return home;
}