import { Game } from './game';
import { Utils } from './utility';
import { Player } from './player';
import { AceBase } from 'acebase';
import { writeFileSync } from 'fs';
import { createServer } from "net";
import { Level, Logger } from './logger';

export enum DBMode {
    WRITE,
    UPDATE,
    REMOVE
}

export abstract class Server {
    static db = new AceBase('dab-db', {
        storage: { path: __dirname },
        logLevel: 'error'
    });
    
    static stalePlayers: Player[] = [];
    static players: Player[] = [];
    static games: Game[] = [];
    static pIds: number = 0;

    static start() {
        const PORT = 8080;
        this.randomizeAccess();
        // process.env.PORT || 8080
        const server = createServer();
        server.listen(PORT, () => Logger.log(Level.INFO,
            "Server Started", `On Port: ${PORT}`));

        server.on('connection', (pSock) => {
            const player = new Player(pSock, this.pIds++);
            player.on("message", this.handleMSG.bind(this));
            player.on("status", this.pushStatusUpdate.bind(this));

            player.on("disconnected", () => {
                try {
                    player.switchState();
                    let discPlr = this.players.indexOf(player);

                    if (discPlr > -1) {
                        this.players.splice(discPlr, 1);
                        this.stalePlayers.push(player);
                    }
                } catch (e) {
                    Logger.log(Level.ERROR, e.toString());
                }
            });
        });
    }

    static async dbGet(path: string): Promise<any> {
        const snap = await this.db.ref(path).get();
        if (!snap.exists()) return null;
        else return snap.val();
    }

    static async dbSet(mode: DBMode, path: string, data: any = null) {
        const dref = this.db.ref(path);

        switch (mode) {
            case DBMode.WRITE:
                await dref.set(data);
                break;

            case DBMode.UPDATE:
                await dref.update(data);
                break;

            case DBMode.REMOVE:
                await dref.remove();
                break;
        }
    }

    private static async handleMSG(plr: Player, msg: any) {
        const data = msg.data;
        switch (msg.type) {
            case "Login":
                let uidEm = 'null';
                if (typeof data.email == 'string') {
                    data.email = data.email.toLowerCase();
                    uidEm = Utils.hash(data.email);
                }

                const userDet = await this
                    .dbGet(`users/${uidEm}`);

                if (userDet !== null) {
                    if (userDet.pass == data.pass) {
                        let secId = plr.id;
                        let secIp = plr.sock.remoteAddress;
                        let secSalt = "JH(4gg*@bIU98*HdfdEUiue";
                        const secret = Utils.hash(secId + secIp + secSalt);
                        plr.postAuth(userDet.name, secret, uidEm);
                        this.players.push(plr);

                        this.broadcast('Joined', {
                            name: userDet.name,
                            id: plr.id
                        }, plr);

                        let plrsData: any[] = [];
                        this.players.forEach((p) => {
                            plrsData.push({
                                id: p.id,
                                name: p.name,
                                status: p.status
                            });
                        });

                        plr.send("Logged-In", {
                            players: plrsData,
                            id: plr.id,
                            secret
                        });
                    }
                    else plr.send('Error', "Oops! That's not your valid login password.");
                    return;
                }

                plr.send('Error', "Please register first to continue");
                break;

            case "Register":
                if (await this.dbGet('regAccessCode') == data.access) {
                    if (data.name.length < 5) {
                        plr.send('Error', "Name is too short, it should be at least 4 characters long.", true);
                        return;
                    }

                    if (Utils.isValidPassword(data.pass)) {
                        plr.send('Error', "Paswword should be alphanumeric having at least 8 characters including special characters", true);
                        return;
                    }

                    if (!data.email || !Utils.isValidEmail(data.email)) {
                        plr.send('Error', "This email doesn't looks like a valid one, try again.", true);
                        return;
                    }

                    if (typeof data.email == 'string')
                        data.email = data.email.toLowerCase();
                    let uidEM = Utils.hash(data.email);

                    await this.dbSet(DBMode.WRITE, `users/${uidEm}`, {
                        email: data.email,
                        name: data.name,
                        pass: data.pass,
                        game: {
                            total: 0,
                            lost: 0,
                            won: 0
                        }
                    });
                }
                break;

            case "Search":
                plr.switchStatus();
                let matchFound: Boolean = false;

                for (var i = 0; i < this.players.length; i++) {
                    const opponent = this.players[i];

                    if (opponent !== plr && opponent.status == "searching") {
                        matchFound = true;
                        const game = new Game(plr, opponent);
                        game.on("Start", () => this.handleGameStart(game));
                        game.on('update', () => this.handleGameUpdate(game));
                        game.on('end', () => this.handleGameEnd(game));
                        this.games.push(game);
                        break;
                    }
                }

                if (!matchFound) {
                    const vFunc = Utils.validator((p: Player) => p.status == 'idle');
                    this.broadcast('Play-Request', {
                        id: plr.id
                    }, vFunc);
                }
                break;

            case "Cancel-Search":
                plr.switchStatus();
                break;

            default:
                plr.send("Error", "Invalid request!");
                break;
        }
    }

    private static async randomizeAccess() {
        const code = parseInt(`${Math.random() * (999999 - 100000) + 100000}`);
        await this.dbSet(DBMode.WRITE, 'regAccessCode', code);
        writeFileSync('access.txt', code.toString());
    }

    private static handleGameStart(game: Game) {
        // Broadcast to users that a new game has started
    }

    private static handleGameEnd(game: Game) {
        // Broadcast to users & viewers that game has ended
    }

    private static handleGameUpdate(game: Game) {
        // Implement feature to live view any active game
        // Broadcast updates to players who are actively wathching live games
    }

    private static pushStatusUpdate(exPlr: Player) {
        this.broadcast('Status-Update', {
            status: exPlr.status,
            id: exPlr.id
        }, exPlr);
    }

    private static broadcast(type: string, data: any, check: Player | Function = null) {
        const isFunc = check instanceof Function;
        
        this.players.forEach((plr) => {
            const proceed = check == null ||
                (isFunc ? check(plr) : check !== plr);
            if (proceed) plr.send(type, data);
        });
    }
}
