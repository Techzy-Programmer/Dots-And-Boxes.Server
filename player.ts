import { Reference } from 'firebase-admin/database';
import { DBMode, Master } from './master';
import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { Utility } from './utility';
import WebSocket = require('ws');
import { Lobby } from './lobby';

export class Player extends EventEmitter {
    name: string;
    dbRef: string;
    session: string;
    id: number = -1;
    alive: boolean = true;
    authenticated: boolean;
    status: String = "idle";
    sock: WebSocket.WebSocket;
    private blockDBRef: Reference;
    private pingTOut: NodeJS.Timeout;

    constructor(sock: WebSocket.WebSocket, id: number) {
        super();
        this.id = id;
        this.sock = sock;
        this.sock.on('message', this.handleData.bind(this));
        this.sock.on('error', this.fireDisconnection.bind(this));
        this.sock.on('close', this.fireDisconnection.bind(this));
        this.pingTOut = setTimeout(() => this.pingKill(), 10 * 1000);
    }

    async postAuth(name: string, emDbRef: string) {
        this.blockDBRef = Master.db.ref(`users/${emDbRef}/isBlocked`);
        let plrsData: any[] = [];

        for (var i = 0; i < Master.players.length; i++) {
            const testPlr = Master.players[i];

            if (testPlr.dbRef === emDbRef) {
                // Looks like user logged in on same browser but on different tab
                testPlr.send("Session-Cancelled");
                testPlr.sock.close();
                await Utility.wait(1000);
            }

            plrsData.push({
                id: testPlr.id,
                name: testPlr.name,
                status: testPlr.status
            });
        }

        let secSalt = "JH(4gg*@bIU98*HdfdEUiue"; // Too salty
        let session = Utility.hash(`${this.id}-
            ${this.sock.url}-
            ${Math.random()}-
            ${Date.now()}-
            ${secSalt}`);

        Master.broadcast('Joined', { // Broadcast to all other players
            name: name,
            id: this.id
        }, this);

        let expiry = Date.now() + 604800000;
        session += `|${expiry}`;

        this.name = name;
        this.dbRef = emDbRef;
        this.session = session;
        this.authenticated = true;
        Master.players.push(this);
        Master.dbSet(DBMode.UPDATE, `users/${this.dbRef}`, { session });

        this.blockDBRef.on("value", async (snap) => {
            const hasBlocked = snap.val();
            if (hasBlocked) {
                this.send("Blocked");
                await Utility.wait(500);
                this.sock.close();
            }
        });

        this.send("Logged-In", { // Send ack of auth success with gathered data
            players: plrsData,
            id: this.id,
            session,
            name
        });

        Logger.log(Level.INFO, `${name} joined with ID = ${this.id}`);
    }

    switchState(newSock: WebSocket.WebSocket = null, isPassive = false, rspTok = "N/A") {
        if (this.alive && this.sock != null) {
            this.authenticated = false;

            if (!isPassive) {
                this.sock = null;
                this.alive = false;
            }

            if (this.status != 'playing') this.status = 'idle';
            if (this.name) Logger.log(Level.INFO, `${this.name} ${isPassive ? 'Logged Out' : 'Stalled'}`);
        }
        else if (newSock != null) {
            this.alive = true;
            this.sock = newSock;
            if (this.status == "playing") this.emit('respawn', rspTok);
            Logger.log(Level.INFO, `${this.name} Revived`)
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
        Logger.log(Level.INFO, `${this.name} is now ${this.status}`);
    }

    fireDisconnection(passive = false) {
        try {
            this.emit("disconnected");

            if (this.status == 'playing') {
                // [To-Do] Implement game notifier
                // Using .emit('disconnected') and on('disconnectd')
            }

            if (this.status == 'searching') {
                Lobby.removeFinder(this);
            }

            clearTimeout(this.pingTOut);
            this.blockDBRef?.off("value");
            this.switchState(null, passive); // Stall the player
            let discPlr = Master.players.indexOf(this);
            // Store the player object so that it can be revived if it gives
            // right secret token with correct authentication
            Master.stalePlayers.push(this);
            if (discPlr > -1) Master.players.splice(discPlr, 1);
            Master.broadcast("Left", { id: this.id });
            if (Master.players.length == 0) Master.pIds = 0;
        } catch (e) {
            Logger.log(Level.ERROR, e.toString());
        }
    }

    send(type: string, data?: any, bypass: boolean = false) {
        // 'bypass' should be used only if we want to send message to un-authorised user
        if ((bypass || this.authenticated) && this.alive && this.sock.readyState == 1) {
            const msg = { type, data };
            this.sock.send(JSON.stringify(msg));
        } else {
            // Something's not good with the player lets log it
            Logger.log(Level.WARN, `Unable to send message to Player(${this.name})`,
                `bypass : authenticated = ${bypass} : ${this.authenticated}`,
                `alive : readyState = ${this.alive} : ${this.sock.readyState}`,
                `MSG-Type: ${type} || My-ID: ${this.id}`);
        }
    }

    private handleData(raw: WebSocket.RawData) {
        let msg: any;
        let errored: boolean = true;
        let strRaw = raw.toString();

        if (strRaw === "Ping") {
            this.sock.send("Pong");
            clearTimeout(this.pingTOut);
            this.pingTOut = setTimeout(() =>
                this.pingKill(), 10 * 1000);
            return;
        }

        try {
            msg = JSON.parse(strRaw);
            if (msg.type && typeof msg.type == 'string') errored = false;
        }
        catch (ex) {
            Logger.log(Level.ERROR, `Unexpected MSG received from ${this.name || this.id}`, ex.toString())
        }

        if (errored) { // Only proceed if data sent by connected client is a valid JSON string
            this.send('Error', "Request should be a JSON string having valid 'type' property.", true);
            return;
        }

        // If player is sending game-data it must be authorized at first place
        if (this.authenticated && msg.type == 'Game-MSG') this.emit('game-msg', msg.data);
        // If player is trying to authenticate or has been already authenticated then allow its request
        else if (this.authenticated || ['Login', 'Register'].includes(msg.type)) this.emit("message", this, msg);
    }

    private pingKill() {
        this.sock.close();
        if (this.name) Logger.log(Level.WARN, `Ping Timed Out for Player(${this.name})`);
    }
}
