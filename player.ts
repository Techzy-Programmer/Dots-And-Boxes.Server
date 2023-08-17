import { Reference } from 'firebase-admin/database';
import { DBMode, Master } from './master';
import { Level, Logger } from './logger';
import { EventEmitter } from 'events';
import { Utility } from './utility';
import WebSocket = require('ws');
import { Lobby } from './lobby';

type Status = "idle" | "searching" | "playing";
const allowedQueueType = ['Quit'];

export class Player extends EventEmitter {
    name: string;
    dbRef: string;
    session: string;
    id: number = -1;
    gameProps: any = {};
    alive: boolean = true;
    authenticated: boolean;
    status: Status = "idle";
    sock: WebSocket.WebSocket;

    private boundHandleMsg;
    private boundHandleDisc;
    private blockDBRef: Reference;
    private pingTOut: NodeJS.Timeout;
    private readonly pingTime: number = 15;

    constructor(sock: WebSocket.WebSocket, id: number) {
        super();
        this.id = id;
        this.sock = sock;
        this.boundHandleDisc = () => this.fireDisconnection.call(this);
        this.boundHandleMsg = (r: WebSocket.RawData) => this.handleData.call(this, r);
        this.pingTOut = setTimeout(() => this.pingKill(), this.pingTime * 1000);
        this.subscribe();
    }

    subscribe() {
        this.sock.on('message', this.boundHandleMsg);
        this.sock.on('error', this.boundHandleDisc);
        this.sock.on('close', this.boundHandleDisc);
    }

    async postAuth(name: string, emDbRef: string, queue?: object, respawned: boolean = false) {
        this.blockDBRef = Master.db.ref(`users/${emDbRef}/isBlocked`);
        let plrsData: any[] = [];
        this.dbRef = emDbRef;

        for (const testPlr of Master.players) {
            if (testPlr.dbRef === emDbRef) {
                // Looks like user logged in on same browser but on different tab
                testPlr.send("Session-Cancelled");
                testPlr.sock?.close();
                await Utility.wait(1000);
            }

            plrsData.push({
                id: testPlr.dbRef,
                name: testPlr.name,
                status: testPlr.status
            });
        }

        const parsedQueueItems = [];

        if (queue) {
            for (const key in queue) {
                const qItem = queue[key];
                if (allowedQueueType.includes(qItem.type)) {
                    this.emit("message", qItem.data);
                    parsedQueueItems.push(key);
                }
            }
        }

        Master.players.add(this);
        let secSalt = "JH(4gg*@bIU98*HdfdEUiue"; // Too salty
        let session = Utility.hash(`${this.dbRef}-
            ${this.sock?.url}-
            ${Math.random()}-
            ${Date.now()}-
            ${secSalt}`);

        Master.broadcast('Joined', { // Broadcast to all other players
            id: this.dbRef,
            name: name
        }, this);

        const discTDel = (Date.now() - this.gameProps.__discTime) / (60 * 1000);
        let respawnFactor = Number.parseInt(`${Math.random() * 100000000}`);
        let wasPlaying = this.status === 'playing' && discTDel <= 4;
        let expiry = Date.now() + 604800000;
        let gcode = '-', gname = '-';
        session += `|${expiry}`;

        this.name = name;
        this.session = session;
        this.authenticated = true;
        Master.dbSet(DBMode.UPDATE, `users/${this.dbRef}`, { session });

        if (wasPlaying) {
            this.gameProps.__secRspFactor = respawnFactor;
            gcode = this.gameProps.__gCode;
            gname = this.gameProps.__gName;
        }
        else respawnFactor = -1;

        this.blockDBRef.on("value", async (snap) => {
            const hasBlocked = snap.val();
            if (hasBlocked) {
                this.send("Blocked");
                await Utility.wait(500);
                this.sock.close();
            }
        });

        this.send("Logged-In", { // Send ack of auth success with gathered data
            playables: Utility.getAvailableGames(),
            players: plrsData,
            parsedQueueItems,
            id: this.dbRef,
            respawnFactor,
            wasPlaying,
            respawned,
            session,
            gcode,
            gname,
            name
        });

        Logger.log(Level.INFO, `${name} joined with ID = ${this.id}`);
    }

    switchState(newSock: WebSocket.WebSocket = null) {
        if (newSock !== null) {
            this.alive = true;
            this.sock = newSock;
            this.subscribe(); // Start Re-listening
            Logger.log(Level.INFO, `${this.name} Revived`);
        }
        else if (this.alive && this.sock !== null) {
            this.sock.off('message', this.boundHandleMsg);
            this.sock.off('error', this.boundHandleDisc);
            this.sock.off('close', this.boundHandleDisc);
            this.authenticated = false;
            this.alive = false;
            this.sock = null;

            if (this.status != 'playing') this.status = 'idle';
            if (this.name) Logger.log(Level.INFO,
                `${this.name} Disconnected`);
        }
    }

    // Change game-play status of the player
    switchStatus(playing: boolean = false, searching: boolean = false) {
        if (playing) this.status = 'playing';
        else if (this.status === 'playing') {
            if (searching) {
                this.emit("leave");
                this.status = 'searching';
            }
            else this.status = 'idle';
        }
        else if (searching) this.status = 'searching';
        else this.status = 'idle';

        this.emit("status", this); // This triggers status-broadcast to all connected players
        Logger.log(Level.INFO, `${this.name} is now ${this.status}`);
    }

    fireDisconnection(passive = false) {
        try {
            if (this.status === 'searching')
                Lobby.removeFinder(this);
            this.switchState(null); // Stall the player
            this.emit("disconnected"); // Emit disconnection signal
        }
        catch (e) {
            Logger.log(Level.ERROR, e.toString());
        }
        finally {
            clearTimeout(this.pingTOut);
            this.blockDBRef?.off("value");

            // Store the player object so that it can be revived if it gives
            // right secret token with correct authentication

            if (Master.players.has(this))
                Master.players.delete(this);
            Master.broadcast("Left", { id: this.id });
            if (Master.players.size === 0) Master.pIds = 0;
            if (!passive && this.dbRef) Master.stalePlayers.set(this.dbRef, this);
        }
    }

    send(type: string, data?: any, bypass: boolean = false) {
        // 'bypass' should be used only if we want to send message to un-authorised user
        if ((bypass || this.authenticated) && this.alive && this.sock?.readyState === 1)
            this.sock.send(JSON.stringify({ type, data }));
        else {
            // Something's not good with the player lets log it
            Logger.log(Level.WARN, `Unable to send message to Player(${this.name})`,
                `alive : readyState = ${this.alive} : ${this.sock?.readyState}`,
                `bypass : authenticated = ${bypass} : ${this.authenticated}`,
                `MSG-Type: ${type} || My-ID: ${this.id}`,
                `MSG-Content: ${JSON.stringify(data)}`
            );
        }
    }

    gsend(msg: string, data?: any) {
        const gmObj = { msg, data };
        this.send("Game-MSG", gmObj);
    }

    private handleData(raw: WebSocket.RawData) {
        let msg: any;
        let errored: boolean = true;
        let strRaw = raw.toString();

        if (strRaw === "Ping") {
            if (this.sock) {
                this.sock.send("Pong");
                clearTimeout(this.pingTOut);
                this.pingTOut = setTimeout(() =>
                    this.pingKill(), this.pingTime * 1000);
            }
            else clearTimeout(this.pingTOut);
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
        if (this.authenticated && msg.type == 'Game-MSG') {
            if (!this.emit('game-msg', msg.data)) this.handleBouncedGMSG(msg.data);
        }
        // If player is trying to authenticate or has been already authenticated then allow its request
        else if (this.authenticated || ['Login', 'Register'].includes(msg.type)) this.emit("message", this, msg);
    }

    private handleBouncedGMSG(bData: any) {
        switch (bData.msg) {
            case 'Quit': this.gsend("Quit-Success"); break;
        }
    }

    private pingKill() {
        this.sock?.close();
        this.fireDisconnection();
        if (this.name) Logger.log(Level.WARN, `Ping Timed Out for Player(${this.name})`);
    }
}
