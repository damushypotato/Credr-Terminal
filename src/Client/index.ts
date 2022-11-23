import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { prompt } from 'inquirer';
import { red, blueBright, greenBright, white, yellow, magentaBright, cyanBright } from 'chalk';
import LCD, { Align } from '../LCD';
import { delay } from '../Tools';

export enum State {
    STOP,
    READ,
}

export default class Client {
    baudRate: number = 57600;
    setStateTimeout: number = 100;
    debug: boolean = false;
    
    state: State;
    ready: boolean = false;
    
    port: SerialPort;
    parser: ReadlineParser = new ReadlineParser({ delimiter: '\r\n' });
    lcd: LCD = new LCD(this);

    constructor(baudRate?: number, debug?: boolean, setStateTimeout?: number) {
        this.baudRate = baudRate || this.baudRate;
        this.debug = debug || this.debug;
        this.setStateTimeout = setStateTimeout || this.setStateTimeout;

        this.parser.on('data', this.dataIn.bind(this));

        this.lcd.addScreen('ready', {
            line1: {
                text: 'Ready!',
                align: Align.CENTER,
            },
            line2: {
                text: 'Present card:',
                align: Align.CENTER,
            },
        });
    }

    async init(customPath?: string): Promise<void> {
        const path = customPath || (await this.selectPort());
        if (!path) {
            const { retry } = await prompt([
                {
                    type: 'confirm',
                    name: 'retry',
                    message: 'Retry?',
                },
            ]);
            if (retry) return this.init();
            return;
        }
        this.port = await this.connect(path, this.baudRate);

        await this.lcd.showScreen('ready');
        await this.setState(State.READ);
    }

    private async dataIn(data: string) {
        if (this.debug) this.debugLogIn(data);

        if (this.state != State.READ) return;

        if (!data.startsWith('SCAN:')) return;

        const uid = data.substring(5);

        await this.setState(State.STOP);
        await this.lcd.write(uid);

        await delay(3000);

        await this.setState(State.READ);
        await this.lcd.showScreen('ready');
    }

    async selectPort(): Promise<string> {
        const list = await SerialPort.list();

        if (list.length == 0) {
            console.log(red('No serial ports detected.'));
            return;
        }

        if (list.length == 1) {
            console.log(blueBright(`Found serial port ${list[0].path}`));
            return list[0].path;
        }

        const { portSelect } = await prompt([
            {
                type: 'list',
                name: 'portSelect',
                message: 'Select a port',
                choices: list.map(port => port.path),
            },
        ]);
        return portSelect;
    }

    async connect(path: string, baudRate: number): Promise<SerialPort> {
        const port = new SerialPort({ path, baudRate });
        port.pipe(this.parser);

        await this.confirmResponse('READY:CREDR', 5000, 'Connection timed out.').catch(err => {
            console.log(red(err));
            return;
        });

        console.log(blueBright(`Connected to device on ${path}`));

        this.ready = true;

        return port;
    }

    async setState(state: State) {
        const s = State[state];
        this.write(`STATE:${s}`);
        try {
            await this.confirmResponse(`STATE=${s}`, this.setStateTimeout, 'Set state timed out.');

            this.state = state;
            if (this.debug) this.debugLogInfo('Successfully set state.');
            return state;
        } catch (err) {
            console.log(red(err));
        }
    }

    write(data: string) {
        if (this.debug) this.debugLogOut(data);
        this.port.write(data);
    }

    disconnect() {
        this.port?.close();
        this.ready = false;
    }

    confirmResponse(
        confirmMessage: string,
        timeout: number,
        timeoutReason: string = 'Timed out.'
    ): Promise<unknown> {
        return new Promise<void>((resolve, reject) => {
            const tm = setTimeout(() => {
                this.parser.removeListener('data', listener);
                reject(timeoutReason);
            }, timeout);

            const listener = (data: string) => {
                if (data == confirmMessage) {
                    this.parser.removeListener('data', listener);
                    clearTimeout(tm);
                    resolve();
                }
            };

            this.parser.addListener('data', listener);
        });
    }

    debugLogIn(string: string) {
        console.log(`🟡 ${greenBright('DEBUG:')} ${yellow(`'${white(string)}'`)}`);
    }

    debugLogOut(string: string) {
        console.log(`🟣 ${greenBright('DEBUG:')} ${yellow(`'${magentaBright(string)}'`)}`);
    }

    debugLogInfo(string: string) {
        console.log(`🟢 ${greenBright('DEBUG:')} ${yellow(`'${cyanBright(string)}'`)}`);
    }
}
