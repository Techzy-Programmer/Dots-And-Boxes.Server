import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { Socket } from "net";

export class Player extends EventEmitter {
    sock: Socket;
    name: string;
    secret: string;
    id: number = -1;
    alive: boolean = true;
    authenticated: boolean;
    status: String = "idle";

    constructor(sock: Socket, id: number) {
        super();
        this.id = id;
        this.sock = sock;
        this.sock.on('data', this.handleData.bind(this));
        this.sock.on('close', () => this.emit('disconnected'));
        Logger.log(Level.INFO, `Player joined with ID = ${id}`,
            `IP:PORT = ${sock.remoteAddress}:${sock.remotePort}`);
    }

    postAuth(name: string, sec: string) {
        this.name = name;
        this.secret = sec;
        this.authenticated = true;
    }

    private handleData(raw: Buffer) {
        let msg: any;
        let errored: boolean = true;

        try {
            msg = JSON.parse(raw.toString());
            if (msg.type && typeof msg.type == 'string') errored = false;
        }
        catch {

        }

        if (errored) {
            this.send('Error', "Request should be a JSON string having valid 'type' property.", true);
            return;
        }

        if (this.authenticated && msg.type == 'Game-MSG') this.emit('game-msg', msg);
        if (this.authenticated || msg.type == 'Login') this.emit("message", this, msg);
    }

    switchState(newSock: Socket = null) {
        if (this.alive && this.sock != null) {
            this.alive = false;
            this.sock = null;
            this.status = 'idle';
            this.authenticated = false;
            Logger.log(Level.INFO, `Player(${this.name}) Stalled`);
        }
        else if (newSock != null) {
            this.alive = true;
            this.sock = newSock;
            Logger.log(Level.INFO, `Player(${this.name}) Revived`)
        }
    }

    switchStatus(playing: boolean = false) {
        if (playing) {
            this.status = 'playing';
        }
        else {
            if (this.status == 'idle')
                this.status = 'searching';
            else if (this.status == 'searching')
                this.status = 'idle';
        }

        this.emit("status", this);
        Logger.log(Level.INFO, `Switched ${this.name}'s status to ${this.status}`);
    }

    send(type: string, data: any, bypass: boolean = false) {
        if ((bypass || this.authenticated) && this.alive && this.sock.readyState == "open") {
            const msg = { type, data };
            this.sock.write(JSON.stringify(msg), (e) => {
                Logger.log(Level.ERROR, `Socket Write(Send) failed`, e.toString());
            });
        } else {
            Logger.log(Level.WARN, `Unable to send message to Player(${this.name})`,
                `bypass : authenticated = ${bypass} : ${this.authenticated}`,
                `alive : readyState = ${this.alive} : ${this.sock.readyState}`);
        }
    }
}
