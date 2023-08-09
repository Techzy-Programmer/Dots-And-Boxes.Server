import { BingoGame } from './bingo';
import { Player } from './player';
import { Master } from './master';
import { RMCSGame } from './rmcs';
import { Game } from './game';

export abstract class Lobby {
    static plrsMap: { [id: string]: [string, number] } = {};
    static finders: { [id: string]: { [id: number]: Player[] } } = {
        'rmcs': {},
        'bgo': {},
        'ttt': {},
        'uno': {}
    };

    static maxPlrs: { [id: string]: [number, boolean] } = {
        'uno': [16, false],
        'rmcs': [4, true],
        'bgo': [4, false],
        'ttt': [2, true],
    };

    static addFinder(plr: Player, gId: string, numPlr: number): boolean {
        const maxPlayers = this.maxPlrs[gId][0];
        const isGmAvail = (gId in this.maxPlrs); // Do server supports the game user wants to play?
        const hasValidNum = numPlr > 1 && numPlr <= maxPlayers; // Check if request contains valid player count
        const isMaxSafe = (this.maxPlrs[gId][1] ? numPlr === maxPlayers : numPlr <= maxPlayers); // Fixed number of players can play only
        if (plr.status === 'searching' || !isGmAvail || !hasValidNum || !isMaxSafe) return false; // Reject malformed request

        plr.switchStatus(false, true);
        this.plrsMap[plr.dbRef] = [gId, numPlr];

        if (!(numPlr in this.finders[gId]))
            this.finders[gId][numPlr] = [];
        this.finders[gId][numPlr].push(plr);
        this.tryMatch(gId, this.finders[gId], numPlr, plr); // Let's try to find a match
        return true; // Players request accepted
    }

    // Called whenever player withdraws request for matchmaking
    static removeFinder(plr: Player) {
        plr.switchStatus(); // Makes player idle
        if (!(plr.dbRef in this.plrsMap)) return;
        const plrSearchData = this.plrsMap[plr.dbRef];
        let numSearch = plrSearchData[1];
        let gmSearch = plrSearchData[0];

        if (gmSearch in this.finders) {
            const plrs = this.finders[gmSearch][numSearch];
            let idx = plrs.indexOf(plr);

            if (idx > -1) {
                delete this.plrsMap[plr.dbRef];
                plrs.splice(idx, 1);
            }

            plrs.forEach(p => p.send('Match-Making-Left', { id: plr.dbRef }));
        }
    }

    private static tryMatch(gId, roomRef: { [id: number]: Player[] }, keyPlr, joined: Player) {
        const roomPlrs = roomRef[keyPlr];
        const plrsId: string[] = [];

        for (var i = 0; i < roomPlrs.length; i++) {
            const eachPlr = roomPlrs[i];
            if (joined === eachPlr) continue;

            plrsId.push(eachPlr.dbRef);
            eachPlr.send("New-Opponent", {
                id: joined.dbRef
            });
        }

        joined.send("In-Lobby", {
            ids: plrsId
        });

        if (roomPlrs.length == keyPlr) { // Required amount of players connected
            let game: Game;

            switch (gId) {
                case "rmcs": {
                    game = new RMCSGame(gId, ...roomPlrs); // & Create new game room with all players
                    break;
                }

                case "bgo": {
                    game = new BingoGame(gId, ...roomPlrs);
                    break;
                }
            }

            game.on("start", () => this.handleGameStart(game));
            game.on('update', () => this.handleGameUpdate(game));
            game.on('end', () => this.handleGameEnd(game));
            Master.games.add(game); // Update global games list
            roomPlrs.length = 0; // Reset the watch variable
        }
    }

    private static handleGameStart(game: Game) {
        // ToDo: Broadcast to users that a new game has started
    }

    private static handleGameEnd(game: Game) {
        game.removeAllListeners('update');
        game.removeAllListeners('start');
        game.removeAllListeners('end');

        // ToDo: Broadcast to users & viewers that game has ended
    }

    private static handleGameUpdate(game: Game) {
        // ToDo: Implement feature to live view any active game
        // ToDo: Broadcast updates to players who are actively wathching live games
    }
}
