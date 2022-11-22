import Client from '../Client';
import { red } from 'chalk';
export enum Align {
    LEFT,
    RIGHT,
    CENTER,
}

interface Line {
    text: string;
    align?: Align;
}

interface Lines {
    line1?: Line;
    line2?: Line;
}

export default class LCD {
    constructor(private client: Client, writeTimeout?: number) {
        this.writeTimeout = writeTimeout || this.writeTimeout;
    }

    writeTimeout: number = 200;
    screens: Map<string, Lines> = new Map();

    addScreen(name: string, lines: Lines): void {
        this.screens.set(name, lines);
    }

    async showScreen(name: string): Promise<void> {
        const screen = this.screens.get(name);
        if (!screen) throw new Error(`Screen ${name} does not exist.`);
        await this.write(screen);
    }

    async write(write: Lines | string): Promise<void> {
        if (typeof write == 'string') this.client.write('WRITE:' + write);
        else this.client.write('WRITE:' + LCD.formatLines(write));
        try {
            await this.client.confirmResponse('WRITE:OK', this.writeTimeout, 'Write timed out.');

            if (this.client.debug) this.client.debugLogInfo('Successfully wrote to LCD.');
        } catch (err) {
            console.log(red(err));
        }
    }

    static formatLines = ({ line1, line2 }: Lines): string =>
        (line1 ? LCD.align(line1) : ' '.repeat(16)) + (line2 ? LCD.align(line2) : ' '.repeat(16));

    static align({ text, align }: Line): string {
        text = text.substring(0, 16);
        switch (align ?? Align.LEFT) {
            case Align.LEFT:
                return text;
            case Align.RIGHT:
                return text.padStart(16, ' ');
            case Align.CENTER:
                const num = (16 - text.length) / 2;
                return ' '.repeat(Math.floor(num)) + text + ' '.repeat(Math.ceil(num));
        }
    }
}
