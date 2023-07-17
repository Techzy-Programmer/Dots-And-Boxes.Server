import { Game } from "./game";
import { Player } from "./player";

export class RMCSGame extends Game {
    psnaToPlrs: { [key: string]: Player } = {};
    readyCnt: Set<Number> = new Set();
    roundsPlayed: number = 1;
    roundPersona: string[];
    chitsSelected: number;
    roundChits: number[];
    ids: number[] = [];
    paused: boolean;

    readonly gamePersona: string[] = ['r', 'm', 'c', 's'];
    readonly psnaPtsMap = {
        r: 1000,
        m: 800,
        c: 0,
        s: 500
    };

    constructor(...plrs: Player[]) {
        /*
         * [To-Do] Dispose game properly
         * Broadcast that game has now ended
         * Remove all listners like (Player.on())
         * Make variables null & remove reference from Master.games[]
        */

        super("Raja Mantri Chor Sipahi", ...plrs);
        this.onMessage(this.processMessage.bind(this));
    }

    processMessage(plr: Player, gmData: any) {
        const { msg, data } = gmData;

        switch (msg) {
            case "Safe-Init": this.initGameRoom(); break;

            case "Ready":
                if (this.paused) return;
                this.readyCnt.add(plr.id);
                if (this.readyCnt.size === 4)
                    this.broadcast('Pick-Chit');
                break;

            case "Chit-Id":
                const cId = data.chitId;
                if (typeof cId === 'number' && cId > -1 && cId < 4 && !this.roundChits.includes(cId)) {
                    const myPersona = this.roundPersona[cId];
                    plr.gameProps.persona = myPersona;
                    this.psnaToPlrs[myPersona] = plr;
                    this.roundChits.push(cId);
                    this.chitsSelected++;

                    plr.gsend("Persona", { psna: myPersona, cId, uId: plr.id });
                    const othersPersona = ['r', 's'].includes(myPersona) ? myPersona : '-';
                    this.broadcast("Persona", { psna: othersPersona, cId, uId: plr.id }, [plr]);

                    if (this.chitsSelected === 4) {
                        const vics = [this.psnaToPlrs["c"].id, this.psnaToPlrs["m"].id]
                            .sort(() => Math.random() - 0.5);
                        const sec = 60;

                        this.broadcast("Start-Round", {
                            sId: this.psnaToPlrs["s"].id,
                            victims: vics
                        });

                        // Sipahi should lose if not properly responded within allowed(sec) timeframe
                        this.psnaToPlrs["s"].gameProps.turnTmr = setTimeout(() => this.assignScore(false, true), sec * 1000)
                    }
                }
                break;

            case "Selection":
                const plrId = data.selPlrId;
                if (this.chitsSelected === 4 && typeof plrId === 'number'
                    && plr.gameProps.persona === 's' && this.ids.includes(plrId))
                {
                    clearTimeout(this.psnaToPlrs['s'].gameProps.turnTmr);
                    if (this.psnaToPlrs['c'].id === plrId) this.assignScore(true);
                    else this.assignScore(false);
                }
                break;

            case "Emoji":
                const targetPlrId = data.targetPlr;
                const targetEmj = data.targetEmj;

                if (typeof targetPlrId === 'number' && typeof targetEmj === 'number' && this.ids.includes(targetPlrId))
                    for (let i = 0; i < this.ids.length; i++)
                        if (targetPlrId === this.all[i].id)
                            this.all[i].gsend("Emoji", {
                                targetPlr: plr.id,
                                targetEmj
                            });
                break;

            default: break;
        }
    }

    initGameRoom() {
        this.resetRound();
        this.paused = false;
        this.all.forEach(p => {
            this.ids.push(p.id);
            p.gameProps = { pts: 0 };
        });
    }

    resetRound() {
        this.paused = true;
        this.roundChits = [];
        this.readyCnt.clear();
        this.chitsSelected = 0;
        this.roundPersona = shuffle(this.gamePersona);
        this.gamePersona.forEach(psna => this.psnaToPlrs[psna] = null);
    }

    assignScore(sipahiWon: boolean, tmrLoss: boolean = false) {
        let leadPlr = -1;
        let plrScores = [];
        let maskedPlrs = [];
        let maxPlrScore = -1;
        const roundDelaySec = 14;
        const round = ++this.roundsPlayed;
        const sId = this.psnaToPlrs['s'].id;

        this.gamePersona.forEach(psna => {
            const plr = this.psnaToPlrs[psna];
            const scr = this.psnaPtsMap[psna];
            let updatableScr = scr;

            switch (psna) { // Assign score respectievely to chor & sipahi 
                case 'c':
                    maskedPlrs.push({ uId: plr.id, uPsna: psna });
                    updatableScr = sipahiWon ? 0 : this.psnaPtsMap['s'];
                    break;

                case 's': updatableScr = sipahiWon ? scr : 0; break;
                case 'm': maskedPlrs.push({ uId: plr.id, uPsna: psna }); break;
            }

            plr.gameProps.pts += updatableScr;
            const upScr = plr.gameProps.pts;

            if (maxPlrScore < upScr) {
                maxPlrScore = upScr;
                leadPlr = plr.id;
            }

            plrScores.push({ uId: plr.id, uPts: upScr });
        });

        // Let's reset the round variables
        this.resetRound();
        setTimeout(() => {
            this.paused = false;
            this.broadcast("New-Round");
        }, roundDelaySec * 1000);

        this.broadcast("Round-Ends", {
            roundDelaySec,
            maskedPlrs,
            plrScores,
            sipahiWon,
            tmrLoss,
            leadPlr,
            round,
            sId
        });
    }
}

function shuffle(arrayIn: string[]): string[] {
    return ([...arrayIn].sort(
        () => Math.random() - 0.5));
}
