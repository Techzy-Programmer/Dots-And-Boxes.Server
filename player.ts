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

        if (this.authenticated || msg.type == 'Login')
            this.emit("message", this, msg);
    }

    private handleDisconnection() {

    }

    switchState(newSock: Socket = null) {
        if (this.alive && this.sock != null) {
            this.alive = false;
            this.sock = null;
            this.status = 'idle';
            this.authenticated = false;
        } else if (newSock != null) {
            this.alive = true;
            this.sock = newSock;
        }
    }

    switchStatus(playing: boolean = false) {
        if (playing) {
            this.status = 'playing';
            return;
        }

        if (this.status == 'idle')
            this.status = 'searching';
        else if (this.status == 'searching')
            this.status = 'idle';

        this.emit("status", this);
    }

    send(type: string, data: any, bypass: boolean = false) {
        if ((bypass || this.authenticated) && this.alive && this.sock.readyState == "open") {
            const msg = { type, data };

            this.sock.write(JSON.stringify(msg), (err) => {
                console.error(err);
            });
        }
    }
}
