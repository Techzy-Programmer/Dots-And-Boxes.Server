import { Server } from 'ws';
import { Game } from './game';
import { Lobby } from './lobby';
import { Utils } from './utility';
import { Player } from './player';
import { AceBase } from 'acebase';
import { writeFileSync } from 'fs';
import { Level, Logger } from './logger';

export enum DBMode {
    WRITE,
    UPDATE,
    REMOVE
}

export abstract class Master
{
    static db = new AceBase('dab-db', {
        storage: { path: __dirname },
        logLevel: 'error'
    });
    
    static stalePlayers: Player[] = []; // Players that have been disconnected or not responding
    static players: Player[] = []; // Active players
    static games: Game[] = []; // All active game rooms
    static pIds: number = 0;

    static start() {
        const port = parseInt(process.env.PORT) || 8080;
        const server = new Server({ port });
        this.randomizeAccess();

        server.on('connection', (pSock) => {
            const player = new Player(pSock, this.pIds++);
            player.on("status", this.pushStatusUpdate);
            player.on("message", this.handleMSG);

            player.on("disconnected", () => { // Player disconnected
                try {
                    player.switchState(); // Stall the player
                    let discPlr = this.players.indexOf(player);
                    // Store the player object so that it can be revived if it gives
                    // right secret token with correct authentication
                    this.stalePlayers.push(player);

                    if (discPlr > -1) {
                        this.players.splice(discPlr, 1);
                    }
                } catch (e) {
                    Logger.log(Level.ERROR, e.toString());
                }
            });
        });

        Logger.log(Level.INFO, "Server Started", `On Port: ${port}`);
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
            case "Login": // [To-Do]: add logic to revive disconnected player
                let uidEm = 'null';
                if (typeof data.email == 'string') {
                    data.email = data.email.toLowerCase();
                    uidEm = Utils.hash(data.email);
                }

                const userDet = await this.dbGet(`users/${uidEm}`);
                if (userDet !== null) { // Okay user already registered!
                    if (userDet.pass == data.pass) { // Authenticate password
                        plr.postAuth(userDet.name, uidEm); // Authentication passed
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

                    if (typeof data.email == 'string')
                        data.email = data.email.toLowerCase();

                    if (!data.email || !Utils.isValidEmail(data.email)) {
                        plr.send('Error', "This email doesn't looks like a valid one, try again.", true);
                        return;
                    }

                    if (await this.dbGet(`users/${data.email}`) !== null) {
                        plr.send('Error', "User already exists! Please login to continue.", true);
                        return;
                    }

                    await this.dbSet(DBMode.WRITE, `users/${uidEm}`, { // Save user's data to db
                        email: data.email,
                        name: data.name,
                        pass: data.pass,
                        game: {
                            total: 0,
                            lost: 0,
                            won: 0
                        }
                    });

                    plr.postAuth(data.name, data.email); // Registration complete
                    return
                }

                plr.send('Error', "Access code is invalid!", true);
                break;

            case "Search": // Match-Making starts
                Lobby.addFinder(plr, msg.gameId, msg.plrCount);
                break;

            case "Cancel-Search": // Match-Making aborted
                plr.switchStatus(); // Makes player idle
                break;

            default: // Hmmm... something suspicious
                plr.send("Error", "Invalid request!");
                break;
        }
    }

    // Randomize access code everytime server restarts or new user registers
    private static async randomizeAccess() { // While signing up user must provide right access code
        const code = parseInt(`${Math.random() * (999999 - 100000) + 100000}`);
        await this.dbSet(DBMode.WRITE, 'regAccessCode', code);
        writeFileSync('access.txt', code.toString());
    }

    private static pushStatusUpdate(exPlr: Player) {
        this.broadcast('Status-Update', { // Inform every other player about 'exPlr' new status
            status: exPlr.status,
            id: exPlr.id
        }, exPlr);
    }

    // Sends message of a given type and data to a subset of players based on the third parameter.
    static broadcast(type: string, data: any, check?: Player | Function) {
        const isFunc = check instanceof Function;
        
        this.players.forEach((plr) => {
            // The optional 'check' parameter is used to determine which players should receive the message.
            // If check is undefined, null, or any falsy value, the message will be sent to all players.
            const proceed = !check || (isFunc ? check(plr) : check !== plr);
            if (proceed) plr.send(type, data);
        });
    }
}
