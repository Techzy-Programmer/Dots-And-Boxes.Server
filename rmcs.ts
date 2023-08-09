import { setTimeout } from "timers";
import { Game } from "./game";
import { Player } from "./player";

export class RMCSGame extends Game {
    private leftPlrs: Set<Player> = new Set();
    private resultDeclared: boolean = false;
    private readonly roundDelaySec = 15;
    private gameEnded: boolean = false;
    private rejoinedCount: number = 0;
    private rsetTOut: NodeJS.Timeout;

    psnaToPlrs: { [key: string]: Player } = {};
    readyCnt: Set<String> = new Set();
    moreHidden: boolean = false;
    roundsPlayed: number = 1;
    roundPersona: string[];
    chitsSelected: number;
    roundChits: number[];
    ids: String[] = [];
    roundPaused: boolean;

    readonly gamePersona: string[] = ['r', 'm', 'c', 's'];
    readonly psnaPtsMap = {
        r: 1000,
        m: 800,
        c: 0,
        s: 500
    };

    constructor(gCode: string, ...plrs: Player[]) {
        /*
         * ToDo: Dispose game properly
         * Broadcast that game has now ended
         * Remove all listners like (Player.on())
         * Make variables null & remove reference from Master.games[]
        */

        super(gCode, "Raja Mantri Chor Sipahi", ...plrs);
        this.onCustomData(this.processCustomData.bind(this));
        this.onMessage(this.processMessage.bind(this));
    }

    processCustomData(type: string, data?: any) {
        switch (type) {
            case "Halted":
                if (this.rsetTOut) clearTimeout(this.rsetTOut);
                clearInterval(this.psnaToPlrs["s"]?.gameProps.turnTmr);
                break;

            case "Destroy":
                this.declareResult();
                break;
        }
    }

    startSipahiTimer() {
        // Sipahi should lose if not properly responded within allowed(sec) timeframe
        this.psnaToPlrs["s"].gameProps.turnTmr = setInterval(() => {
            if (this.psnaToPlrs["s"].gameProps.timeLeft % 5 === 0) // Periodically send correction data to player who may can go out of sync
                this.broadcast("Correct-Timer", { sipahiTime: this.psnaToPlrs["s"].gameProps.timeLeft });

            if (--this.psnaToPlrs["s"].gameProps.timeLeft <= 0) { // Decrement and check simultaneously
                clearInterval(this.psnaToPlrs["s"].gameProps.turnTmr);
                this.assignScore(false, true);
            }
        }, 1000);
    }

    informStartRound(skipTmrInit: boolean = false) {
        let vics = [], avPsna = ['m', 'c'];
        if (this.moreHidden) avPsna.push('r');
        avPsna.forEach(psna => vics
            .push(this.psnaToPlrs[psna].dbRef));
        vics = vics.sort(() => Math.random() - 0.5);

        const sipahi: Player = this.psnaToPlrs["s"];
        if (!skipTmrInit) sipahi.gameProps.timeLeft = 60;
        sipahi.gsend("Start-Round", { victims: vics });
        this.broadcast("Start-Round", {}, [sipahi]);
        this.startSipahiTimer();
    }

    processMessage(plr: Player, gmData: any) {
        const { msg, data } = gmData;

        switch (msg) {
            case "Safe-Init": this.initGameRoom(); break;

            case "Ready":
                if (this.halted) {
                    if (data?.srf !== plr.gameProps
                        .__secRspFactor) return;

                    if (this.discPlrs.delete(plr.dbRef)) {
                        this.broadcast("Re-Joined", { who: plr.dbRef }, [plr]);
                        this.leftPlrs.add(plr);
                        this.rejoinedCount++;
                    }

                    if (this.discPlrs.size !== 0) { // Checkpoint for players who haven't yet re-joined the game room
                        plr.gsend("Disconnected", {});
                        return;
                    }

                    const roundGoing: boolean = !this.roundPaused;
                    let sipahiTime = -1;

                    if (roundGoing && this.psnaToPlrs["s"]) {
                        const plrGProps = this.psnaToPlrs["s"].gameProps;
                        plrGProps.timeLeft += 2; // Grace lifespan for sipahi
                        if (plrGProps.timeLeft > 59) plrGProps.timeLeft = 59;
                        sipahiTime = plrGProps.timeLeft;
                    }

                    if (sipahiTime > -1) this.broadcast("Correct-Timer", { sipahiTime });
                    const roundsPlayed: number = this.roundsPlayed;
                    const scoresData = this.buildScoresData(true);

                    for (const lftPlr of this.leftPlrs) {
                        const chitsData = this.buildChitsData(
                            roundGoing, true, lftPlr.dbRef);

                        lftPlr.gsend("Render-Game", {
                            roundsPlayed,
                            scoresData,
                            chitsData
                        });
                    }
                    return;
                }

                if (this.roundPaused) return;
                this.readyCnt.add(plr.dbRef);
                if (this.readyCnt.size === 4)
                    this.broadcast('Pick-Chit');
                break;

            case "Game-Rendered":
                if (this.leftPlrs.delete(plr)) this.rejoinedCount--;
                if (this.rejoinedCount !== 0) return;
                if (this.destroyer) clearTimeout(this.destroyer);
                const roundDelaySec = this.roundDelaySec;
                this.halted = false;

                this.broadcast("Re-Start", {
                    allChosen: this.chitsSelected === 4,
                    roundGoing: !this.roundPaused,
                    roundDelaySec
                });

                if (!this.roundPaused) {
                    if (this.chitsSelected === 4)
                        this.informStartRound(true);
                }
                else this.resetRound();
                break;

            case "Chit-Id":
                if (this.halted) return;
                const cId = data.chitId;
                const cIdValid = typeof cId === 'number' && cId > -1 && cId < 4;

                if (this.ids.includes(plr.dbRef) && cIdValid && !this.roundChits.includes(cId) && !this.roundPaused) {
                    const myPersona = this.roundPersona[cId];
                    plr.gameProps.persona = myPersona;
                    this.psnaToPlrs[myPersona] = plr;
                    plr.gameProps.myChitId = cId;
                    this.roundChits.push(cId);
                    this.chitsSelected++;

                    plr.gsend("Persona", { psna: myPersona, cId, uId: plr.dbRef });
                    const othersPersona = (this.moreHidden ? ['r'] : ['r', 's'])
                        .includes(myPersona) ? myPersona : '-';
                    this.broadcast("Persona", {
                        psna: othersPersona,
                        uId: plr.dbRef,
                        cId
                    }, [plr]);

                    if (this.chitsSelected === 4)
                        this.informStartRound();
                }
                break;

            case "Selection":
                if (this.halted) return;
                const plrId = data.selPlrId;
                if (this.chitsSelected === 4 && typeof plrId === 'string'
                    && plr.gameProps.persona === 's' && this.ids.includes(plrId))
                {
                    clearInterval(this.psnaToPlrs['s'].gameProps.turnTmr);
                    if (this.psnaToPlrs['c'].dbRef === plrId) this.assignScore(true);
                    else this.assignScore(false);
                }
                break;

            case "Emoji":
                if (this.halted) return;
                const targetPlrId = data.targetPlr;
                const targetEmj = data.targetEmj;

                if (typeof targetPlrId === 'string' && typeof targetEmj === 'number' && this.ids.includes(targetPlrId)) {
                    const target = this.allPlrs.get(targetPlrId);
                    target.gsend("Emoji", {
                        targetPlr: plr.dbRef,
                        targetEmj
                    });
                }
                break;

            case "Quit":
                if (plr.status !== 'playing') return;
                const pQuit: boolean = data?.promptQuit &&
                    data?.srf === plr.gameProps.__secRspFactor;
                this.broadcast("Quit", { who: plr.dbRef, pQuit }, [plr]);
                setTimeout(this.declareResult.bind(this), 2000);
                plr.gsend("Quit-Success");
                break;

            default: break;
        }
    }

    initGameRoom() {
        this.resetRound(true);
        this.roundPaused = false;

        for (const p of this.allPlrs.values()) {
            p.gameProps.leading = false
            this.ids.push(p.dbRef);
            p.gameProps.pts = 0;
        }
    }

    resetRound(prevent = false) {
        const clearRoundVars = () => {
            this.roundChits = [];
            this.readyCnt.clear();
            this.chitsSelected = 0;
            this.roundPersona = shuffle(this.gamePersona);
            this.gamePersona.forEach(psna => this.psnaToPlrs[psna] = null);
        }

        if (!prevent) {
            this.roundPaused = true;
            this.rsetTOut =
                setTimeout(() => {
                    clearRoundVars();
                    if (this.halted) return;
                    this.roundPaused = false;
                    this.broadcast("New-Round");
                }, this.roundDelaySec * 1000);
        }
        else clearRoundVars();
    }

    buildChitsData(hidden = false, includeAll = false, revPlrId: string = ""): any[] {
        let chitPlrs = [];
        let maskedPsna = ['c', 'm'];
        if (this.moreHidden) maskedPsna.push('s');

        maskedPsna.forEach(psna => {
            const dcPlr = this.psnaToPlrs[psna];
            if (dcPlr)
                chitPlrs.push({
                    cId: dcPlr.gameProps.myChitId,
                    uPsna: (hidden && (dcPlr.dbRef !== revPlrId) ? '-' : psna),
                    uId: dcPlr.dbRef,
                });
        });

        if (includeAll) {
            let otherPsna = this.moreHidden ? ['r'] : ['r', 's'];
            otherPsna.forEach(psna => {
                const dcPlr = this.psnaToPlrs[psna];
                if (dcPlr)
                    chitPlrs.push({
                        cId: dcPlr.gameProps.myChitId,
                        uId: dcPlr.dbRef,
                        uPsna: psna
                    });
            });
        }

        chitPlrs = chitPlrs.sort(() => Math.random() - 0.5);
        return chitPlrs;
    }

    buildScoresData(onlyAlive: boolean = false): any[] {
        let plrScores = [];
        for (const kvPD of this.allPlrs) {
            if (!onlyAlive || kvPD[1].alive)
                plrScores.push({
                    leading: kvPD[1].gameProps.leading,
                    uPts: kvPD[1].gameProps.pts,
                    uId: kvPD[0]
                });
        }
        return plrScores;
    }

    assignScore(sipahiWon: boolean, tmrLoss: boolean = false) {
        let leadPlr = '';
        let maxPlrScore = -1;
        const round = ++this.roundsPlayed;
        const chitsData = this.buildChitsData();

        this.gamePersona.forEach(psna => {
            const plr = this.psnaToPlrs[psna];
            const scr = this.psnaPtsMap[psna];
            let updatableScr = scr;

            switch (psna) { // Assign score respectievely to chor & sipahi 
                case 'c': updatableScr = sipahiWon ? 0 : this.psnaPtsMap['s']; break;
                case 's': updatableScr = sipahiWon ? scr : 0; break;
            }

            plr.gameProps.pts += updatableScr;
            plr.gameProps.leading = false;
            const upScr = plr.gameProps.pts;

            if (!leadPlr || maxPlrScore < upScr) {
                maxPlrScore = upScr;
                leadPlr = plr.dbRef;
            }
        });

        const scoresData = this.buildScoresData(); // get scores only after scores updation
        // Let's reset the round variables
        this.resetRound();
        
        this.allPlrs.get(leadPlr)
            .gameProps.leading = true;

        this.broadcast("Round-Ends", {
            roundDelaySec: this.roundDelaySec,
            maskedPlrs: chitsData,
            plrScores: scoresData,
            sipahiWon,
            tmrLoss,
            leadPlr,
            round
        });
    }

    saveScoreToDB(plrDBRef: string, pts: number, won: boolean) {
        // ToDo: Save scores to Firebase rtdb
    }

    declareResult() {
        if (this.resultDeclared || this.gameEnded) return;
        const plrsArr: Player[] = [...this.allPlrs.values()];
        const plrsReslt = [];
        let position = 0;
        let tmpScr = -1;

        plrsArr.sort((p1, p2) => {
            if (p1.gameProps.pts > p2.gameProps.pts) return -1;
            else if (p1.gameProps.pts < p2.gameProps.pts) return 1;
            else return 0;

        });

        for (const srtPlr of plrsArr) {
            if (tmpScr !== srtPlr.gameProps.pts) {
                tmpScr = srtPlr.gameProps.pts;
                position++;
            }

            plrsReslt.push({
                uId: srtPlr.dbRef,
                uPos: position,
                uScr: tmpScr
            });

            this.resultDeclared = true;
            this.saveScoreToDB(srtPlr.dbRef, srtPlr.gameProps.pts, (position === 1));
        }

        this.broadcast("Game-Ends", { result: plrsReslt });
        this.destroy();
    }

    destroy() {
        // Free up the resources and clean up references
        this.chitsSelected = null;
        this.roundsPlayed = null;
        this.roundPersona = null;
        this.roundPaused = null;
        this.roundChits = null;
        this.psnaToPlrs = null;
        this.moreHidden = null;
        this.gameEnded = true;
        this.readyCnt = null;
        this.ids = null;
        super.dispose();
    }
}

function shuffle(arrayIn: string[]): string[] {
    return ([...arrayIn].sort(
        () => Math.random() - 0.5));
}
