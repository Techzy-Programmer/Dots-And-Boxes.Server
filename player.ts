import { DBMode, Master } from './master';
import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { Utils } from './utility';
import WebSocket = require('ws');

export class Player extends EventEmitter {
    name: string;
    dbRef: string;
    session: string;
    id: number = -1;
    alive: boolean = true;
    authenticated: boolean;
    status: String = "idle";
    sock: WebSocket.WebSocket;

    constructor(sock: WebSocket.WebSocket, id: number) {
        super();
        this.id = id;
        this.sock = sock;
        this.sock.on('message', this.handleData.bind(this));
        this.sock.on('error', () => this.emit('disconnected'));
        this.sock.on('close', this.fireDisconnection.bind(this));
        Logger.log(Level.INFO, `Player joined with ID = ${id}`);
    }

    postAuth(name: string, emDbRef: string) {
        let secSalt = "JH(4gg*@bIU98*HdfdEUiue"; // Too salty
        let session = Utils.hash(`${this.id}-
            ${this.sock.url}-
            ${Math.random()}-
            ${Date.now()}-
            ${secSalt}`);

        Master.broadcast('Joined', { // Broadcast to all other players
            name: name,
            id: this.id
        }, this);

        let plrsData: any[] = [];
        Master.players.forEach((p) => { // Gather data of all connected players
            plrsData.push({
                id: p.id,
                name: p.name,
                status: p.status
            });
        });

        let expiry = Date.now() + 604800000;
        session += `|${expiry}`;

        this.name = name;
        this.dbRef = emDbRef;
        this.session = session;
        this.authenticated = true;
        Master.players.push(this);
        Master.dbSet(DBMode.UPDATE, `users/${this.dbRef}`, { session });

        this.send("Logged-In", { // Send ack of auth success with gathered data
            players: plrsData,
            id: this.id,
            session,
            name
        });
    }

    private handleData(raw: WebSocket.RawData) {
        let msg: any;
        let errored: boolean = true;

        try {
            msg = JSON.parse(raw.toString());
            if (msg.type && typeof msg.type == 'string') errored = false;
        }
        catch (ex) {
            Logger.log(Level.ERROR, `Unexpected MSG received from ${this.name}`, ex.toString())
        }

        if (errored) { // Only proceed if data sent by connected client is a valid JSON string
            this.send('Error', "Request should be a JSON string having valid 'type' property.", true);
            return;
        }

        // If player is sending game-data it must be authorized at first place
        if (this.authenticated && msg.type == 'Game-MSG') this.emit('game-msg', msg);
        // If player is trying to authenticate or has been already authenticated then allow its request
        else if (this.authenticated || ['Login', 'Register'].includes(msg.type)) this.emit("message", this, msg);
    }

    switchState(newSock: WebSocket.WebSocket = null, isPassive = false) {
        if (this.alive && this.sock != null) {
            this.status = 'idle';
            this.authenticated = false;

            if (!isPassive) {
                this.sock = null;
                this.alive = false;
            }

            Logger.log(Level.INFO, `Player(${this.name || this.id}) ${isPassive ? 'Logged Out' : 'Stalled'}`);
        }
        else if (newSock != null) {
            this.alive = true;
            this.sock = newSock;
            Logger.log(Level.INFO, `Player(${this.name || this.id}) Revived`)
        }
    }

    fireDisconnection(passive = false) {
        try {
            // [To-Do] remove from lobby if searching for game
            this.switchState(null, passive); // Stall the player
            let discPlr = Master.players.indexOf(this);
            // Store the player object so that it can be revived if it gives
            // right secret token with correct authentication
            Master.stalePlayers.push(this);
            if (discPlr > -1) Master.players.splice(discPlr, 1);
        } catch (e) {
            Logger.log(Level.ERROR, e.toString());
        }
    }

    // Change game-play status of the player
    switchStatus(playing: boolean = false) {
        if (playing) {
            this.status = 'playing';
        }
        else {
            if (this.status == 'idle')
                this.status = 'searching';
            else this.status = 'idle';
        }

        this.emit("status", this); // This triggers status-broadcast to all connected players
        Logger.log(Level.INFO, `Switched ${this.name}'s status to ${this.status}`);
    }

    send(type: string, data: any, bypass: boolean = false) {
        // 'bypass' should be used only if we want to send message to un-authorised user
        if ((bypass || this.authenticated) && this.alive && this.sock.readyState == 1) {
            const msg = { type, data };
            this.sock.send(JSON.stringify(msg));
        } else {
            // Something's not good with the player lets log it
            Logger.log(Level.WARN, `Unable to send message to Player(${this.name})`,
                `bypass : authenticated = ${bypass} : ${this.authenticated}`,
                `alive : readyState = ${this.alive} : ${this.sock.readyState}`);
        }
    }
}
