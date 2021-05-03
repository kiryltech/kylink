import * as express from 'express'
import {smarthome} from 'actions-on-google'
import {json} from 'body-parser'
import {createServer} from 'https'
import {readFileSync} from 'fs'
import * as somfy from './somfy'

const app = express();
app.use(json());

const home = smarthome();
app.use('/smarthome', home);

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
                    manufacturer: 'North Solar Screen',
                    model: 'Grande',
                    hwVersion: '1.0',
                    swVersion: '1.0.1',
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
    const result = await Promise.all(
        commands.map(somfy.sendCommand));
    return {
        requestId: body.requestId,
        payload: {
            commands: result.map((rs, i) => ({
                ids: [commands[i].params.targetID],
                status: rs ? 'SUCCESS':'ERROR',
            }))
        }
    };
});

home.onDisconnect(() => {
    return {};
});

const options = {
    key: readFileSync(process.env.TLS_KEY_FILE),
    cert: readFileSync(process.env.TLS_CERT_FILE)
};

const port = 9000;
createServer(options, app).listen(port, () => {
    console.log(`Server started at port ${port}.`);
});
