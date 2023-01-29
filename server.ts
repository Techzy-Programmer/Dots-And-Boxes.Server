import { Game } from './game';
import { Player } from './player';
import { createServer } from "net";
import { randomBytes, createHmac } from 'crypto';
const localDB = ["Rishabh", "Hariom", "Akash", "Abhit", "Kelvin", "Nishant"];
// Next step would be to use a dynamic db

export class Server {
    stalePlayers: Player[] = [];
    players: Player[] = [];
    games: Game[] = [];
    pIds: number = 0;

    constructor() {
        const server = createServer();
        server.listen(process.env.PORT || 8080,
            () => console.log('Server Started'));

        server.on('connection', (pSock) => {
            const player = new Player(pSock, this.pIds++);
            player.on("message", this.handleMSG.bind(this));
            player.on("status", this.pushStatusUpdate.bind(this));

            player.on("disconnected", () => {
                try {
                    let discPlr = this.players.indexOf(player);

                    if (discPlr > -1) {
                        this.players.splice(discPlr, 1);
                        this.stalePlayers.push(player);
                    }
                } catch (e) {
                    console.error(e);
                }
            });
        });
    }

    private handleMSG(plr: Player, msg: any) {
        const data = msg.data;
        switch (msg.type) {
            case "Login":
                if (data.code == 'dab-1029' && localDB.includes(data.name)) {
                    let secId = plr.id;
                    let secIp = plr.sock.remoteAddress;
                    let secSalt = "JH(4gg*@bIU98*HdfdEUiue";
                    const secret = this.createSecureHash(secId + secIp + secSalt);
                    plr.postAuth((data.name).toString(), secret);
                    this.players.push(plr);

                    this.broadcast('Joined', {
                        name: plr.name,
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
                    const vFunc = this.validator((p: Player) => p.status == 'idle');
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

    private createSecureHash(string) {
        const salt = randomBytes(16).toString('hex');
        const hash = createHmac('sha256', salt).update(string).digest('hex');
        return salt + hash;
    }

    private handleGameStart(game: Game) {
        // Broadcast to users that a new game has started
    }

    private handleGameEnd(game: Game) {
        // Broadcast to users & viewers that game has ended
    }

    private handleGameUpdate(game: Game) {
        // Implement feature to live view any active game
        // Broadcast updates to players who are actively wathching live games
    }

    private pushStatusUpdate(exPlr: Player) {
        this.broadcast('Status-Update', {
            status: exPlr.status,
            id: exPlr.id
        }, exPlr);
    }

    private validator(predicate: Function) {
        return function (value) {
            return predicate(value);
        }
    }

    private broadcast(type: string, data: any, check: Player | Function = null) {
        const isFunc = check instanceof Function;
        
        this.players.forEach((plr) => {
            const proceed = check == null ||
                (isFunc ? check(plr) : check !== plr);
            if (proceed) plr.send(type, data);
        });
    }
}
