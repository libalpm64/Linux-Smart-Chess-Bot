// ==UserScript==
// @name        Smart Chess Bot: The Ultimate Chess Analysis System
// @namespace   Libalpm
// @author      Libalpm
// @version     8.8
// @homepageURL https://github.com/libalpm64/Linux-Smart-Chess-Bot/
// @supportURL  https://libalpm.dev
// @match       https://www.chess.com/*
// @match       https://lichess.org/*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_xmlhttpRequest
// @grant       GM_getResourceText
// @grant       GM_registerMenuCommand
// @description Our chess analysis system analyzes any chess position and suggests the best possible move.
// @require     https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/content/UserGui.js
// @resource    jquery.js          https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/content/jquery.js
// @resource    chessboard.js      https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/content/chessboard.js
// @resource    chessboard.css     https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/content/chessboard.css
// @run-at      document-start
// @inject-into content
// @downloadURL https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/smart-chess.js
// @updateURL   https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/system_meta.js
// ==/UserScript==

// ─── Constants ────────────────────────────────────────────────────────────────
const repositoryRawURL  = 'https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main';
const LICHESS_API       = 'https://lichess.org/api/cloud-eval';
const CHESS_COM         = 0;
const LICHESS_ORG       = 1;
const TURN_UPDATE_FIX   = false;

const MAX_DEPTH         = 20;
const MIN_DEPTH         = 1;
const MAX_MOVETIME      = 2000;
const MIN_MOVETIME      = 50;
const MAX_ELO           = 3500;
const DEPTH_MODE        = 0;
// const MOVETIME_MODE  = 1;  // reserved
const MAX_LOGS          = 50;

const rank = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master', 'Grand Master'];

// Engine index → resource name mapping (index 4 = stockfish-18, index 5 = node server)
const ENGINE_RESOURCES  = ['lozza.js', 'stockfish-5.js', 'stockfish-2018.js', 'tomitankChess.js', 'stockfish-18-asm.js'];
const ENGINE_NAMES      = ['Lozza', 'Stockfish 5', 'Stockfish 2018', 'TomitankChess', 'Stockfish 18 ASM'];
const ENGINE_WASM        = 4;
const node_engine_id    = 5; // index for node server

const best_move_color                = [0,   0,   250, 0.5];
const opposite_best_move_color       = [250, 0,   0,   0.5];
const possible_moves_colors          = [[200,180,0,0.9],[150,180,0,0.9],[100,180,0,0.9],[50,180,0,0.9]];
const opposite_possible_moves_colors = [[250,200,200,0.9],[250,150,150,0.9],[250,100,100,0.9],[250,50,50,0.9]];
const defaultFromSquareStyle = 'border:4px solid rgb(0 0 0/50%);';
const defaultToSquareStyle   = 'border:4px dashed rgb(0 0 0/50%);';

// GM storage keys
const DB = {
    nightMode:'nightMode', engineMode:'engineMode', engineIndex:'engineIndex',
    reload_every:'reload_every', reload_engine:'reload_engine',
    enableUserLog:'enableUserLog', enableEngineLog:'enableEngineLog',
    displayMovesOnSite:'displayMovesOnSite', show_opposite_moves:'show_opposite_moves',
    use_book_moves:'use_book_moves', node_engine_url:'node_engine_url',
    node_engine_name:'node_engine_name', current_depth:'current_depth',
    current_movetime:'current_movetime', max_best_moves:'max_best_moves'
};

// ─── Mutable state ────────────────────────────────────────────────────────────
let nightMode           = false;
let engineMode          = 0;
let engineIndex         = 0;
let reload_every        = 10;
let reload_engine       = false;
let enableUserLog       = true;
let enableEngineLog     = true;
let displayMovesOnSite  = false;
let show_opposite_moves = false;
let use_book_moves      = false;
let node_engine_url     = 'http://localhost:5000';
let node_engine_name    = 'stockfish-15.exe';
let current_depth       = Math.round(MAX_DEPTH / 2);
let current_movetime    = Math.round(MAX_MOVETIME / 3);
let max_best_moves      = 1;

let lastBestMoveID      = 0;
let guiPagesAdded       = false;
let closedGui           = false;
let reload_count        = 1;

let Interface           = null;
let CURRENT_SITE        = null;
let boardElem           = null;
let firstPieceElem      = null;
let forcedBestMove      = false;
let engine              = null;
let engineObjectURL     = null;
let loadedEngineIndex = -1;

let chessBoardElem      = null;
let turn                = '-';
let last_turn           = null;
let playerColor         = null;
let lastPlayerColor     = null;
let isPlayerTurn        = null;
let lastFen             = null;

let activeGuiMoveHighlights  = [];
let activeSiteMoveHighlights = [];
let possible_moves           = [];

let engineLogNum        = 1;
let userscriptLogNum    = 1;
let enemyScore          = 0;
let myScore             = 0;

// ─── GUI singleton ────────────────────────────────────────────────────────────
const Gui = new UserGui();
Gui.settings.window.title    = 'Smart Chess Bot';
Gui.settings.window.external = true;
Gui.settings.window.size     = { width: 500, height: 620 };
Gui.settings.gui.external    = { popup: true, style: '' };

// Inject chessboard.css + layout overrides into the popup's <style>
Gui.settings.gui.external.style += GM_getResourceText('chessboard.css');
Gui.settings.gui.external.style += `
</style><style>
div[class^='board'] { background-color:#000; }
body { display:block; margin:0 auto; width:360px; }
#fen { margin-left:10px; }
#engine-log-container,
#userscript-log-container { max-height:30vh; overflow:auto !important; }
.sideways-card { display:flex; align-items:center; justify-content:space-between; }
.rendered-form .card { margin-bottom:10px; }
.hidden { display:none; }
.main-title-bar { display:flex; justify-content:space-between; }
@keyframes wiggle {
  0%,80%  { transform:scale(1);   }
  85%     { transform:scale(1.1); }
  95%,100%{ transform:scale(1);   }
}
.wiggle { display:inline-block; animation:wiggle 1s infinite; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const isFirefox         = () => navigator.userAgent.toLowerCase().includes('firefox');
const alphabetPosition  = ch => ch.charCodeAt(0) - 97;
const removeDuplicates  = arr => [...new Set(arr)];
const sleep             = ms => new Promise(r => setTimeout(r, ms));

function fenSquareToChessComSquare(sq) {
    const [x, y] = sq.split('');
    return `square-${'abcdefgh'.indexOf(x) + 1}${y}`;
}

// ─── FenUtils ─────────────────────────────────────────────────────────────────
function FenUtils() {
    // Fresh 8×8 board filled with 1 (empty)
    this.board = Array.from({ length: 8 }, () => Array(8).fill(1));

    this.pieceCodeToFen = str => {
        const [color, name] = str.split('');
        return color === 'w' ? name.toUpperCase() : name.toLowerCase();
    };

    /**
     * Returns the FEN character for a piece element on the LIVE BOARD.
     * Chess.com pieces have classes like "wp", "bk", "wn" etc.
     * Lichess pieces expose `.cgPiece` as e.g. "white king".
     * Returns null if the element has no recognizable color class yet
     * (e.g. animation ghost) — callers must guard for null.
     */
    this.getFenCodeFromPieceElem = elem => {
        if (CURRENT_SITE === CHESS_COM) {
            const cls = [...elem.classList].find(c => /^(b|w)[prnbqk]$/.test(c));
            if (!cls) return null;
            return this.pieceCodeToFen(cls);
        } else if (CURRENT_SITE === LICHESS_ORG) {
            let cp = elem.cgPiece || elem.dataset?.role || elem.getAttribute('data-role');
            if (!cp) {
                const role = elem.getAttribute('data-role') || elem.classList?.find(c => c.startsWith('role-'));
                const color = elem.getAttribute('data-color') || elem.classList?.find(c => c === 'white' || c === 'black');
                if (role && color) {
                    const roleMap = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
                    const r = role.replace('role-', '');
                    return this.pieceCodeToFen((color[0]) + (roleMap[r] || r[0]));
                }
                return null;
            }
            const [color, name] = cp.split(' ');
            return this.pieceCodeToFen(color[0] + (name === 'knight' ? 'n' : name[0]));
        }
        return null;
    };

    this.getPieceColor         = s => (s === s.toUpperCase() ? 'w' : 'b');
    this.getPieceOppositeColor = s => (this.getPieceColor(s) === 'w' ? 'b' : 'w');

    this.squeezeEmptySquares = fen =>
        fen.replace(/11111111/g,'8').replace(/1111111/g,'7').replace(/111111/g,'6')
           .replace(/11111/g,'5').replace(/1111/g,'4').replace(/111/g,'3').replace(/11/g,'2');

    this.posToIndex = pos => {
        const [x, y] = pos.split('');
        return { y: 8 - Number(y), x: 'abcdefgh'.indexOf(x) };
    };

    this.getBoardPiece = pos => {
        const { y, x } = this.posToIndex(pos);
        return this.board[y][x];
    };

    this.getRights = () => {
        let r = '';
        const [e1,h1,a1,e8,h8,a8] = ['e1','h1','a1','e8','h8','a8'].map(p => this.getBoardPiece(p));
        if (e1==='K' && h1==='R') r += 'K';
        if (e1==='K' && a1==='R') r += 'Q';
        if (e8==='k' && h8==='r') r += 'k';
        if (e8==='k' && a8==='r') r += 'q';
        return r || '-';
    };

    this.getBasicFen = () => {
        const sel = CURRENT_SITE === CHESS_COM ? '.piece' : 'piece, .cg-piece, [data-role]';
        [...chessBoardElem.querySelectorAll(sel)]
            .filter(e => !e.classList.contains('ghost'))
            .forEach(e => {
                const code = this.getFenCodeFromPieceElem(e);
                if (code === null) return; // skip ghosts / animating pieces with no color yet

                if (CURRENT_SITE === CHESS_COM) {
                    const m = e.className.match(/square-(\d)(\d)/);
                    if (!m) return;
                    this.board[8 - Number(m[2])][Number(m[1]) - 1] = code;
                } else {
                    let key = e.cgKey || e.dataset?.key || e.getAttribute('data-key') || e.getAttribute('data-square');
                    if (key) {
                        const [x, y] = key.split('');
                        this.board[8 - Number(y)][alphabetPosition(x)] = code;
                    } else {
                        const pos = elem.style.left || elem.style.transform;
                        if (pos) {
                            const m = pos.match(/(\d+)%/);
                            if (m) {
                                const col = Math.floor(parseInt(m[1]) / 12.5);
                                const row = Math.floor(parseInt(m[1]) / 12.5);
                            }
                        }
                    }
                }
            });
        return this.squeezeEmptySquares(this.board.map(r => r.join('')).join('/'));
    };

    this.getFen = () => `${this.getBasicFen()} ${last_turn || turn} ${this.getRights()} - 0 1`;
}

// ─── InterfaceUtils ───────────────────────────────────────────────────────────
function InterfaceUtils() {
    // Single-element query cache keyed by CSS selector string
    const cache = {};
    const $  = sel => Gui.document && (cache[sel] !== undefined ? cache[sel] : (cache[sel] = Gui.document.querySelector(sel)));

    this.boardUtils = {
        findSquareElem: code => Gui.document?.querySelector(`.square-${code}`),

        markMove: (from, to, color) => {
            if (!Gui?.document) return;
            if (CURRENT_SITE === CHESS_COM && !isFirefox()) {
                [from, to].forEach((sq, i) => {
                    const el = this.boardUtils.findSquareElem(sq);
                    if (!el) return;
                    el.style.scale = i === 0 ? '0.8' : '0.9';
                    el.style.backgroundColor = `rgb(${color[0]},${color[1]},${color[2]})`;
                    activeGuiMoveHighlights.push(el);
                });
            }
            if (displayMovesOnSite || (!isPlayerTurn && show_opposite_moves))
                markMoveToSite(from, to, color);
        },

        removeBestMarkings: () => {
            activeGuiMoveHighlights.forEach(el => {
                el.style.scale = '1';
                el.style.backgroundColor = '';
            });
            activeGuiMoveHighlights = [];
        },

        updateBoardFen: fen => {
            const el = $('#fen');
            if (el) el.textContent = fen.slice(0, fen.lastIndexOf('-') - 1);
        },

        updateBoardPower: (my, enemy) => {
            const es = $('#enemy-score'), ms = $('#my-score');
            if (es) es.textContent = enemy;
            if (ms) ms.textContent = my;
        },

        updateBoardOrientation: o => {
            const el = $('#orientation');
            if (el) el.textContent = o;
        }
    };

    // Shared log helper
    const appendLog = (containerId, str, num) => {
        const container = Gui.document?.querySelector(containerId);
        if (!container) return;
        const el = document.createElement('div');
        el.classList.add('list-group-item');
        if (str.includes('info'))     el.classList.add('list-group-item-info');
        if (str.includes('bestmove')) el.classList.add('list-group-item-success');
        el.innerText = `#${num} ${str}`;
        if (container.children.length >= MAX_LOGS) container.lastChild.remove();
        container.prepend(el);
    };

    this.engineLog = str => { if (enableEngineLog) appendLog('#engine-log-container', str, engineLogNum++); };
    this.log       = str => { if (enableUserLog)   appendLog('#userscript-log-container', str, userscriptLogNum++); };

    this.getBoardOrientation = () => {
        if (CURRENT_SITE === CHESS_COM)   return document.querySelector('.board.flipped') ? 'b' : 'w';
        if (CURRENT_SITE === LICHESS_ORG) return document.querySelector('.orientation-white') ? 'w' : 'b';
        return 'w';
    };

    const progressBar = () => $('#best-move-progress');

    this.updateBestMoveProgress = text => {
        if (!Gui?.document || isFirefox() || CURRENT_SITE === LICHESS_ORG) return;
        const el = progressBar();
        if (!el) return;
        el.innerText = text;
        el.classList.remove('hidden');
        el.classList.add('wiggle');
    };

    this.stopBestMoveProcessingAnimation = () => {
        if (!Gui?.document || isFirefox() || CURRENT_SITE === LICHESS_ORG) return;
        progressBar()?.classList.remove('wiggle');
    };

    this.hideBestMoveProgress = () => {
        if (!Gui?.document || isFirefox() || CURRENT_SITE === LICHESS_ORG) return;
        const el = progressBar();
        if (el && !el.classList.contains('hidden')) {
            el.classList.add('hidden');
            el.classList.remove('wiggle');
        }
    };
}

function LozzaUtility() {
    this.extractInfo = str =>
        ['time','nps','depth','pv'].reduce((acc, key) => {
            const m = str.match(`${key} (\\d+)`);
            if (m) acc[key] = m[1];
            return acc;
        }, {});
}

// ─── Site move highlighting ───────────────────────────────────────────────────
function markMoveToSite(fromSq, toSq, rgba) {
    const highlight = (sq, style) => {
        if (CURRENT_SITE === CHESS_COM) {
            const cls = fenSquareToChessComSquare(sq);
            document.querySelector(`${TURN_UPDATE_FIX ? '.custom' : ''}.highlight.${cls}`)?.remove();
            const el = document.createElement('div');
            el.className = `custom highlight ${cls}`;
            el.dataset.testElement = 'highlight';
            el.style.cssText = style;
            el.style.backgroundColor = `rgba(${rgba.join(',')})`;
            activeSiteMoveHighlights.push(el);
            chessBoardElem.prepend(el);
        } else if (CURRENT_SITE === LICHESS_ORG) {
            const cg = chessBoardElem.querySelector('cg-container');
            const w = parseInt(cg.style.width)  / 8;
            const h = parseInt(cg.style.height) / 8;
            const flipped = !document.querySelector('.orientation-white');
            const xi = alphabetPosition(sq[0]);
            const yi = Number(sq[1]);
            const x  = flipped ? (7 - xi) * w : xi * w;
            const y  = flipped ? (yi - 1) * h : (8 - yi) * h;
            const el = document.createElement('square');
            el.className = 'custom highlight';
            el.dataset.testElement = 'highlight';
            el.style.cssText = style;
            el.style.backgroundColor = `rgba(${rgba.join(',')})`;
            el.style.transform = `translate(${x}px,${y}px)`;
            el.style.zIndex = '1';
            activeSiteMoveHighlights.push(el);
            cg.prepend(el);
        }
    };
    highlight(fromSq, defaultFromSquareStyle);
    highlight(toSq,   defaultToSquareStyle);
}

function removeSiteMoveMarkings() {
    activeSiteMoveHighlights.forEach(el => el?.remove());
    activeSiteMoveHighlights = [];
}

// ─── Turn detection (chess.com fallback) ──────────────────────────────────────
function getTurn() {
    Interface.boardUtils.removeBestMarkings();
    removeSiteMoveMarkings();
    for (const hl of chessBoardElem.querySelectorAll('.highlight')) {
        if (hl.classList.contains('custom')) continue;
        const sqCls = [...hl.classList].find(c => c.includes('square'));
        if (!sqCls) return '';
        const piece = chessBoardElem.querySelector(`.piece.${sqCls}`);
        if (!piece) continue;
        const colorCls = [...piece.classList].find(c => c.length <= 2);
        if (!colorCls) return '';
        return colorCls[0] === 'b' ? 'w' : 'b';
    }
    return '';
}

// ─── Elo / rank ───────────────────────────────────────────────────────────────
function getElo() {
    const ratio = engineMode === DEPTH_MODE ? current_depth / MAX_DEPTH : current_movetime / MAX_MOVETIME;
    return Math.round(MAX_ELO * ratio);
}

function getRank() {
    const ratio = engineMode === DEPTH_MODE ? current_depth / MAX_DEPTH : current_movetime / MAX_MOVETIME;
    const idx   = Math.min(Math.round(ratio * rank.length), rank.length - 1);
    return rank[idx];
}

function setEloDescription(eloElem) {
    if (!eloElem) return;
    eloElem.querySelector('#value').innerText = `Elo: ${getElo()}`;
    eloElem.querySelector('#rank').innerText  = `Rank: ${getRank()}`;
    eloElem.querySelector('#power').innerText = engineMode === DEPTH_MODE
        ? `Depth: ${current_depth}` : `Move Time: ${current_movetime}`;
}

// ─── Board/move core ──────────────────────────────────────────────────────────
function clearBoard() {
    Interface.stopBestMoveProcessingAnimation();
    Interface.boardUtils.removeBestMarkings();
    removeSiteMoveMarkings();
}

function moveResult(from, to, power, clear = true) {
    if (!from || !to || from.length < 2 || to.length < 2) return;
    if (clear) clearBoard();

    if (!forcedBestMove) {
        if (isPlayerTurn) myScore += Number(power);
        else              enemyScore += Number(power);
        Interface.boardUtils.updateBoardPower(myScore, enemyScore);
    } else {
        forcedBestMove = false;
        const btn = Gui.document?.querySelector('#bestmove-btn');
        if (btn) btn.disabled = false;
    }

    const extras = removeDuplicates(possible_moves).slice(0, max_best_moves - 1);
    extras.forEach((mv, i) => {
        Interface.boardUtils.markMove(
            mv.slice(0,2), mv.slice(2,4),
            isPlayerTurn ? possible_moves_colors[i] : opposite_possible_moves_colors[i]
        );
    });
    Interface.boardUtils.markMove(from, to, isPlayerTurn ? best_move_color : opposite_best_move_color);
    Interface.stopBestMoveProcessingAnimation();
}

const START_FEN_W = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_FEN_B = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';

function updateBoard(clear = true) {
    if (clear) clearBoard();
    const fen = new FenUtils().getFen();
    if (fen === START_FEN_W || fen === START_FEN_B) {
        enemyScore = myScore = 0;
        Interface.boardUtils.updateBoardPower(0, 0);
    }
    isPlayerTurn = playerColor === null || last_turn === null || last_turn === playerColor;
    Interface.boardUtils.updateBoardFen(fen);
}

function sendBestMove() {
    if (!isPlayerTurn && !show_opposite_moves) return;
    const fen = new FenUtils().getFen();
    possible_moves = [];
    lastBestMoveID++;
    const req = { id: lastBestMoveID, fen };
    reloadChessEngine(false, () => {
        Interface.log('Sending best move request to engine...');
        use_book_moves ? getBookMoves(req) : getBestMoves(req);
    });
}

function updateBestMove(mutationArr) {
    const fenUtil = new FenUtils();
    const fen = fenUtil.getFen();
    if (fen === lastFen) return;
    lastFen = fen;

    if (mutationArr) {
        const attrMuts = mutationArr.filter(m =>
            CURRENT_SITE === CHESS_COM
                ? m.target.classList.contains('piece') && m.attributeName === 'class'
                : m.target.tagName === 'PIECE' && !m.target.classList.contains('fading') && m.attributeName === 'class'
        );
        if (attrMuts.length) {
            const code = fenUtil.getFenCodeFromPieceElem(attrMuts[0].target);
            if (code !== null) {
                turn = fenUtil.getPieceOppositeColor(code);
                last_turn = turn;
                if (TURN_UPDATE_FIX && getTurn() !== '') turn = getTurn();
                Interface.log(`Turn updated to ${turn}!`);
            }
        }
    }
    updateBoard();
    sendBestMove();
}

// ─── Engine requests ──────────────────────────────────────────────────────────
function safeParseJSON(text) {
    try {
        const trimmed = (text || '').trim();
        if (!trimmed || trimmed[0] === '<') return null; // HTML error page guard
        return JSON.parse(trimmed);
    } catch (_) {
        return null;
    }
}

function resetBestMoveBtn() {
    forcedBestMove = false;
    const btn = Gui.document?.querySelector('#bestmove-btn');
    if (btn) btn.disabled = false;
}

function getBookMoves(request) {
    GM_xmlhttpRequest({
        method: 'GET',
        url: `${LICHESS_API}?fen=${encodeURIComponent(request.fen)}&multiPv=1&variant=fromPosition`,
        headers: { 'Content-Type': 'application/json' },
        onload: res => {
            if (lastBestMoveID !== request.id) return;
            const data = safeParseJSON(res.response);
            if (!data || data.error || !res.ok || !data.pvs?.[0]?.moves) {
                Interface.log('Book move unavailable, falling back to engine.');
                return getBestMoves(request);
            }
            const move = data.pvs[0].moves.split(' ')[0];
            if (!move || move.length < 4) return getBestMoves(request);
            moveResult(move.slice(0,2), move.slice(2,4), current_depth, true);
        },
        onerror: () => { if (lastBestMoveID === request.id) getBestMoves(request); }
    });
}

function getNodeBestMoves(request) {
    const url = `${node_engine_url}/getBestMove?fen=${encodeURIComponent(request.fen)}`
        + `&engine_mode=${engineMode}&depth=${current_depth}&movetime=${current_movetime}`
        + `&turn=${encodeURIComponent(last_turn || turn)}&engine_name=${encodeURIComponent(node_engine_name)}`;
    GM_xmlhttpRequest({
        method: 'GET', url,
        headers: { 'Content-Type': 'application/json' },
        onload: res => {
            if (lastBestMoveID !== request.id) return;
            if (res.response === 'false' || !res.ok) {
                resetBestMoveBtn();
                return Interface.log('check node/go server logs !!');
            }
            const data = safeParseJSON(res.response);
            if (!data) {
                resetBestMoveBtn();
                Interface.log(`Server returned non-JSON: ${(res.response || '').slice(0, 80)}`);
                return;
            }
            const { depth, movetime, score, move } = data;
            if (!move || move.length < 4) {
                resetBestMoveBtn();
                Interface.log('Server returned invalid move.');
                return;
            }
            Interface.updateBestMoveProgress(
                engineMode === DEPTH_MODE ? `Depth: ${depth}` : `Move time: ${movetime} ms`);
            moveResult(move.slice(0,2), move.slice(2,4), score, true);
        },
        onerror: () => {
            resetBestMoveBtn();
            Interface.log('make sure the server is running !!');
        }
    });
}

function getBestMoves(request) {
    if (engineIndex === node_engine_id)
        return getNodeBestMoves(request);

    if (!engine) return;

    engine.postMessage('position fen ' + request.fen);
    engine.postMessage(engineMode === DEPTH_MODE
        ? `go depth ${current_depth}` : `go movetime ${current_movetime}`);

    engine.onmessage = e => {
        if (lastBestMoveID !== request.id) return;
        const data = e.data;
        if (data.includes('bestmove')) {
            const move = data.split(' ')[1];
            moveResult(move.slice(0,2), move.slice(2,4), current_depth, true);
        } else if (data.includes('info')) {
            const info = LozzaUtils.extractInfo(data);
            const pvMove = data.slice(data.lastIndexOf('pv')).split(' ')[1];
            if (pvMove) possible_moves.push(pvMove);
            Interface.updateBestMoveProgress(
                engineMode === DEPTH_MODE
                    ? `Depth: ${info.depth || current_depth}`
                    : `Move time: ${info.time || current_movetime} ms`);
        }
        Interface.engineLog(data);
    };
}

// ─── Engine lifecycle ─────────────────────────────────────────────────────────
function loadChessEngine(callback) {
    const engineName = ENGINE_RESOURCES[engineIndex];
    const engineBase = `${repositoryRawURL}/engines`;

if (engineIndex === ENGINE_WASM) {
        // ASM version - load like regular engine
        const base = repositoryRawURL + '/engines/js';
        const jsFile = 'stockfish-18-asm.js';
        
        Interface.log('SF18-ASM loading...');
        
        fetch(base + '/' + jsFile).then(function(r) {
            return r.text();
        }).then(function(src) {
            engineObjectURL = URL.createObjectURL(
                new Blob([src], { type: 'application/javascript' }));
            loadedEngineIndex = ENGINE_WASM;
            engine = new Worker(engineObjectURL);
            engine.postMessage('ucinewgame');
            Interface.log('Loaded: ' + ENGINE_NAMES[ENGINE_WASM]);
        }).catch(function(e) {
            Interface.log('SF ASM error: ' + e);
        });
        
        return callback();
    }

    if (engineName) {
        fetch(`${engineBase}/js/${engineName}`).then(r => r.text()).then(src => {
            engineObjectURL = URL.createObjectURL(
                new Blob([src], { type: 'application/javascript' }));
            loadedEngineIndex = engineIndex;
            engine = new Worker(engineObjectURL);
            engine.postMessage('ucinewgame');
            Interface.log(`Loaded engine: ${ENGINE_NAMES[engineIndex]}`);
        }).catch(e => {
            Interface.log(`Failed to load engine: ${e}`);
        });
    } else if (engineObjectURL && loadedEngineIndex === engineIndex) {
        engine = new Worker(engineObjectURL);
        engine.postMessage('ucinewgame');
    }
    callback();
}

function reloadChessEngine(forced, callback) {
    const needsReload = forced || loadedEngineIndex !== engineIndex || (reload_engine && reload_count >= reload_every);
    if (engineIndex === node_engine_id && !needsReload) return callback();

    if (needsReload) {
        reload_count = 1;
        Interface.log('Reloading chess engine...');
        engine?.terminate();
        loadChessEngine(callback);
    } else {
        reload_count++;
        callback();
    }
}

// ─── Player / board observation ───────────────────────────────────────────────
function updatePlayerColor(callback) {
    playerColor = Interface.getBoardOrientation();
    turn = playerColor;
    Interface.boardUtils.updateBoardOrientation(playerColor);
    callback();
}

function observeNewMoves() {
    updateBestMove();
    new MutationObserver(muts => {
        lastPlayerColor = playerColor;
        updatePlayerColor(() => {
            if (playerColor !== lastPlayerColor) {
                Interface.log(`Color changed: ${lastPlayerColor} → ${playerColor}`);
                updateBestMove();
            } else {
                updateBestMove(muts);
            }
        });
    }).observe(chessBoardElem, { childList: true, subtree: true, attributes: true });
}

// ─── Night mode ───────────────────────────────────────────────────────────────
function applyNightMode() {
    if (!Gui.document) return;
    const toggleSel = (sel, multi) => {
        const els = multi
            ? [...Gui.document.querySelectorAll(sel)]
            : [Gui.document.querySelector(sel)].filter(Boolean);
        els.forEach(el => el.classList.toggle('night', nightMode));
    };
    toggleSel('body',                        false);
    toggleSel('.card',                       true);
    toggleSel('.card-title',                 true);
    toggleSel('.form-control',               true);
    toggleSel('label',                       true);
    toggleSel('.checkmark',                  true);
    toggleSel('input',                       true);
    toggleSel('.list-group',                 true);
    toggleSel('.card-footer',                true);
    toggleSel('#fen',                        false);
    toggleSel('.nav-tabs .nav-link',         true);
}

// ─── GUI pages ────────────────────────────────────────────────────────────────
const SETTINGS_CSS = `
<style>
body{display:grid;justify-items:center;background:#fff;transition:.2s}
body.night{background:#312e2b}
.rendered-form{width:500px}
.card{border:3px solid rgba(0,0,0,.2)!important;background:#fff;transition:.2s}
.card.night{background:#545454}
.card-title{color:#000;transition:.2s}
.card-title.night{color:#fff}
.form-control{color:#000;background:#fff;transition:.2s}
.form-control.night{color:#fff;background:#525252}
label,input{color:#000;background:#fff;transition:.2s}
label.night,input.night{color:#fff;background:#525252}
.list-group div{background:#fff;transition:.2s}
.list-group.night div{background:#bbb}
.card-footer{color:#000;font-weight:bold;transition:.2s}
.card-footer.night{color:#fff}
#fen{color:#000;font-size:15px;word-break:break-word;transition:.2s}
#fen.night{color:#fff}
.nav-tabs .nav-link:hover{border-color:#454646 #454646 #454646;isolation:isolate}
.nav-tabs .nav-link.night:hover{border-color:#e9ecef #e9ecef #dee2e6}
.nav-tabs .nav-link.active{background:#bbb}
.nav-tabs .nav-link.active.night{background:#fff}
.btn{border-color:#bbb;border-width:3px;width:100%;transition:.2s}
.btn:hover{background:#0d6efd}
.btn:active{background:#0c5acd}
.space{height:10px}
.form-control,.list-group{border:2px solid #0000004f!important}
#reload-count{width:15%}
.nav-link{font-weight:bold}
.alert{padding:20px;background:#f44336;color:#fff}
.container{display:block;position:relative;padding-left:35px;margin-bottom:12px;cursor:pointer;font-size:15px;user-select:none}
.container input{position:absolute;opacity:0;cursor:pointer;height:0;width:0}
.checkmark{display:flex;justify-content:center;align-items:center;position:absolute;top:0;left:0;height:25px;width:25px;background:#eee;outline:3px solid #bbb}
.checkmark.night{outline:none}
.container:hover input~.checkmark{background:#ccc}
.container input:checked~.checkmark{background:#2196F3}
.checkmark:after{content:"";position:absolute;display:none}
.container input:checked~.checkmark:after{display:block}
.container .checkmark:after{width:40%;height:70%;margin-left:1px;border:solid white;border-width:0 3px 3px 0;transform:rotate(45deg)}
</style>`;

// Build engine option list from ENGINE_NAMES + node server
const engineOptionsHtml = ENGINE_NAMES.map(n => `<option>${n}</option>`).join('')
    + `<option>Node / Go Server</option>`;

function addGuiPages() {
    if (guiPagesAdded) return;
    guiPagesAdded = true;

    // ── Main ──────────────────────────────────────────────────────────────────
    Gui.addPage('Main', `
    <div class="rendered-form" id="main-tab">
      <div class="card">
        <div class="card-body" id="chessboard-card">
          <div class="main-title-bar">
            <h4 class="card-title">Live Chessboard</h4>
            <p class="card-title" id="best-move-progress"></p>
          </div>
          <div id="board" style="width:447px"></div>
        </div>
        <div id="orientation" class="hidden"></div>
        <div class="card-footer sideways-card">
          <input class="btn" type="button" value="Get Best Move" id="bestmove-btn">
        </div>
        <div class="card-footer sideways-card">FEN: <div id="fen"></div></div>
        <div class="card-footer sideways-card">ENEMY SCORE: <div id="enemy-score">0</div></div>
        <div class="card-footer sideways-card">MY SCORE: <div id="my-score">0</div></div>
      </div>
    </div>`);

    // ── Log ───────────────────────────────────────────────────────────────────
    Gui.addPage('Log', `
    <div class="rendered-form" id="log-tab">
      <div class="card">
        <div class="card-body">
          <h4 class="card-title">Userscript Log</h4>
          <ul class="list-group" id="userscript-log-container"></ul>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <h4 class="card-title">Engine Log</h4>
          <ul class="list-group" id="engine-log-container"></ul>
        </div>
      </div>
    </div>`);

    // ── Settings ──────────────────────────────────────────────────────────────
    Gui.addPage('Settings', `
    ${SETTINGS_CSS}
    <div class="rendered-form" id="settings-tab">
      <div class="card">
        <div class="card-body">
          <h4 class="card-title">Main Settings</h4>
          <input class="btn" type="button" value="Reset Settings" id="reset-settings">
          <div class="space"></div>
          <input class="btn" type="button" value="${nightMode ? 'Disable Night Mode' : 'Enable Night Mode'}" id="night-mode-btn">
          <div class="space"></div>
          <input class="btn" type="button" value="Tutorials / Support" id="tuto-btn">
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <h4 class="card-title">Engine</h4>
          <select class="form-control" id="select-engine">${engineOptionsHtml}</select>
          <div class="space"></div>
          <label class="container">Use book moves (Lichess API)
            <input type="checkbox" id="use-book-moves" ${use_book_moves ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
          <div id="reload-engine-div" style="display:${engineIndex === node_engine_id ? 'none' : 'block'}">
            <label class="container">Enable Engine Reload
              <input type="checkbox" id="reload-engine" ${reload_engine ? 'checked' : ''}>
              <span class="checkmark"></span>
            </label>
            <div id="reload-count-div" style="display:${reload_engine ? 'block' : 'none'}">
              <label>Reload every
                <input type="number" id="reload-count" value="${reload_every}" style="width:15%">
                moves
              </label>
            </div>
          </div>
          <div id="node-engine-div" style="display:${engineIndex === node_engine_id ? 'block' : 'none'}">
            <label>Server URL:<br><input type="text" id="engine-url" value="${node_engine_url}" style="width:100%"></label>
            <div class="space"></div>
            <label>Engine Name:<br><input type="text" id="engine-name" value="${node_engine_name}" style="width:100%"></label>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <h4 class="card-title">Engine Strength</h4>
          <label>Engine Mode:</label>
          <select class="form-control" id="select-engine-mode">
            <option>Depth</option>
            <option>Move time</option>
          </select>
          <div class="space"></div>
          <label>Engine Power:</label>
          <input type="range"  class="form-range" min="${MIN_DEPTH}"    max="${MAX_DEPTH}"    step="1"   value="${current_depth}"    id="depth-range">
          <input type="number" class="form-range" min="${MIN_DEPTH}"    max="${MAX_DEPTH}"               value="${current_depth}"    id="depth-range-number" style="display:none">
          <input type="range"  class="form-range" min="${MIN_MOVETIME}" max="${MAX_MOVETIME}" step="50"  value="${current_movetime}" id="movetime-range"        style="display:none">
          <input type="number" class="form-range" min="${MIN_MOVETIME}" max="${MAX_MOVETIME}"             value="${current_movetime}" id="movetime-range-number" style="display:none">
        </div>
        <div class="card-footer sideways-card" id="elo">
          <ul style="margin:0">
            <li id="value">Elo: ${getElo()}</li>
            <li id="rank">Rank: ${getRank()}</li>
            <li id="power">Depth: ${current_depth}</li>
          </ul>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <h4 class="card-title">Visual</h4>
          <h6 class="alert">⚠ Warning ⚠: Displaying moves on-site is detectable — use with caution!</h6>
          <div id="max-moves-div" style="display:${engineIndex === node_engine_id ? 'none' : 'block'}">
            <label>Max Best Moves:
              <input type="number" min="1" max="4" id="max-moves" value="${max_best_moves}">
            </label>
          </div>
          <label class="container">Display moves on chessboard
            <input type="checkbox" id="display-moves-on-site" ${displayMovesOnSite ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
          <label class="container">Display opponent best moves
            <input type="checkbox" id="show-opposite-moves" ${show_opposite_moves ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <h4 class="card-title">Logging</h4>
          <label class="container">Enable Userscript Log
            <input type="checkbox" id="enable-user-log" ${enableUserLog ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
          <label class="container">Enable Engine Log
            <input type="checkbox" id="enable-engine-log" ${enableEngineLog ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
        </div>
      </div>
    </div>`);
}

// ─── Open GUI ─────────────────────────────────────────────────────────────────
function openGUI() {
    Gui.open(() => {
        /**
         * The popup window needs jQuery loaded before chessboard.js.
         * We inject them as <script> tags and wait for both to be ready
         * before wiring up the board observers.
         */
        const popDoc  = Gui.document;
        const popHead = popDoc.head;
        const popWin  = Gui.window;
        const q = id => popDoc.querySelector(id);

        const injectScript = (text) => {
            const s = popDoc.createElement('script');
            s.textContent = text;
            popHead.appendChild(s);
        };

        // Inject jQuery first (synchronously from @resource cache), then chessboard.js
        injectScript(GM_getResourceText('jquery.js'));
        injectScript(GM_getResourceText('chessboard.js'));

        // ── Init the visual chessboard in the popup ──
        const fenEl         = q('#fen');
        const orientationEl = q('#orientation');

        if (!fenEl) {
            // FEN element not found — remove board card
            q('#chessboard-card')?.remove();
            q('#orientation')?.remove();
            return;
        }

        // Wait for jQuery and ChessBoard to be available in the popup window
        // Poll with increasing delays to ensure libraries are fully loaded
        const waitForLibraries = (attempts = 0) => {
            const maxAttempts = 50; // ~5 seconds total
            const delay = attempts < 10 ? 50 : 100; // Start fast, then slow down
            
            if (attempts >= maxAttempts) {
                console.warn('UserGui: jQuery or ChessBoard failed to load after multiple attempts');
                q('#chessboard-card')?.remove();
                q('#orientation')?.remove();
                return;
            }

            // Check if both jQuery and ChessBoard are available in popup context
            if (popWin.jQuery && popWin.ChessBoard) {
                initializeChessboard();
            } else {
                setTimeout(() => waitForLibraries(attempts + 1), delay);
            }
        };

        const initializeChessboard = () => {
            const $ = popWin.jQuery;
            
            // Double-check the elements still exist
            if (!q('#board')) {
                console.warn('UserGui: #board element not found');
                return;
            }

            let uiBoard = popWin.ChessBoard('board', {
                pieceTheme: `${repositoryRawURL}/tampermonkey%20script/content/chesspieces/{piece}.svg`,
                position:   'start',
                orientation: playerColor === 'b' ? 'black' : 'white'
            });

            // Verify the board was actually created
            if (!uiBoard) {
                console.error('UserGui: ChessBoard initialization returned null/undefined');
                q('#chessboard-card')?.remove();
                return;
            }

            console.log('UserGui: ChessBoard successfully initialized');

            // Watch orientation element for flips
            new MutationObserver(() => {
                try {
                    uiBoard = popWin.ChessBoard('board', {
                        pieceTheme: `${repositoryRawURL}/tampermonkey%20script/content/chesspieces/{piece}.svg`,
                        position:   fenEl.textContent || 'start',
                        orientation: orientationEl.textContent === 'b' ? 'black' : 'white'
                    });
                } catch (e) {
                    console.error('UserGui: Error reinitializing board on orientation change:', e);
                }
            }).observe(orientationEl, { childList: true, characterData: true, subtree: true });

            // Watch FEN element for position updates
            new MutationObserver(() => {
                try { 
                    const newFen = fenEl.textContent;
                    if (newFen && uiBoard) {
                        uiBoard.position(newFen); 
                    }
                } catch(e) {
                    console.error('UserGui: Error updating board position:', e);
                }
            }).observe(fenEl, { childList: true, characterData: true, subtree: true });
        };

        // Start waiting for libraries
        waitForLibraries();

        // ── Cache all settings elements ──
        const depthRangeEl       = q('#depth-range');
        const depthRangeNumEl    = q('#depth-range-number');
        const moveTimeRangeEl    = q('#movetime-range');
        const moveTimeRangeNumEl = q('#movetime-range-number');
        const maxMovesEl         = q('#max-moves');
        const maxMovesDivEl      = q('#max-moves-div');
        const engineModeEl       = q('#select-engine-mode');
        const engineEl           = q('#select-engine');
        const engineNameDivEl    = q('#node-engine-div');
        const reloadEngineDivEl  = q('#reload-engine-div');
        const reloadEngineEl     = q('#reload-engine');
        const reloadEveryDivEl   = q('#reload-count-div');
        const reloadEveryEl      = q('#reload-count');
        const nodeNameEl         = q('#engine-name');
        const nodeUrlEl          = q('#engine-url');
        const useBookEl          = q('#use-book-moves');
        const showOppEl          = q('#show-opposite-moves');
        const displayOnSiteEl    = q('#display-moves-on-site');
        const enableUserLogEl    = q('#enable-user-log');
        const enableEngineLogEl  = q('#enable-engine-log');
        const eloEl              = q('#elo');
        const bestMoveBtnEl      = q('#bestmove-btn');
        const nightModeEl        = q('#night-mode-btn');
        const tutoEl             = q('#tuto-btn');
        const resetEl            = q('#reset-settings');

        // ── Apply initial state ──
        fixDepthMoveTimeInput(depthRangeEl, depthRangeNumEl, moveTimeRangeEl, moveTimeRangeNumEl, eloEl);
        if (engineEl)     engineEl.selectedIndex     = engineIndex;
        if (engineModeEl) engineModeEl.selectedIndex = engineMode;
        applyNightMode();

        // Firefox compat
        if (isFirefox()) {
            popDoc.querySelectorAll('.rendered-form').forEach(el => el.style.width = 'auto');
            const gui     = q('#gui');
            const content = q('#content');
            if (gui)     gui.style.minWidth = '350px';
            if (content) { content.style.maxHeight = '500px'; content.style.overflow = 'scroll'; }
            [q('#engine-log-container'), q('#userscript-log-container')].forEach(el => {
                if (el) { el.style.maxHeight = '100px'; el.style.overflow = 'scroll'; }
            });
            q('#button-close-gui')?.addEventListener('click', e => {
                e.preventDefault();
                closedGui = !closedGui;
                if (content) content.style.display = closedGui ? 'none' : 'block';
            });
        }

        // Lichess overrides - use stockfish-18 by default
        if (CURRENT_SITE === LICHESS_ORG) {
            if (engineEl) engineEl.selectedIndex = ENGINE_WASM;
            if (maxMovesDivEl)    maxMovesDivEl.style.display    = 'none';
            if (engineNameDivEl)  engineNameDivEl.style.display  = 'none';
            if (reloadEngineDivEl) reloadEngineDivEl.style.display = 'block';
        }

        // ── Event listeners ──
        if (resetEl) resetEl.onclick = async () => {
            await GM_setValue(DB.nightMode, undefined);
            Gui.close();
            guiPagesAdded = false;
            initialize();
        };

        if (tutoEl) tutoEl.onclick = () =>
            window.open('https://www.youtube.com/watch?v=WaqI4l_hmIE&t=16s', '_blank');

        if (nightModeEl) nightModeEl.onclick = () => {
            nightMode = !nightMode;
            nightModeEl.value = nightMode ? 'Disable Night Mode' : 'Enable Night Mode';
            applyNightMode();
            GM_setValue(DB.nightMode, nightMode);
        };

        if (bestMoveBtnEl) bestMoveBtnEl.onclick = () => {
            if (forcedBestMove) return;
            bestMoveBtnEl.disabled = true;
            forcedBestMove = true;
            updateBoard();
            sendBestMove();
        };

        if (engineModeEl) engineModeEl.onchange = () => {
            engineMode = engineModeEl.selectedIndex;
            GM_setValue(DB.engineMode, engineMode);
            fixDepthMoveTimeInput(depthRangeEl, depthRangeNumEl, moveTimeRangeEl, moveTimeRangeNumEl, eloEl);
        };

        if (engineEl) engineEl.onchange = () => {
            engineIndex = engineEl.selectedIndex;
            GM_setValue(DB.engineIndex, engineIndex);
            const isNode = engineIndex === node_engine_id;
            if (reloadEngineDivEl)  reloadEngineDivEl.style.display  = isNode ? 'none' : 'block';
            if (engineNameDivEl)    engineNameDivEl.style.display    = isNode ? 'block' : 'none';
            if (maxMovesDivEl)      maxMovesDivEl.style.display      = isNode ? 'none' : 'block';
            if (engineObjectURL) { URL.revokeObjectURL(engineObjectURL); engineObjectURL = null; }
            reloadChessEngine(true, () => {
                Interface.boardUtils.removeBestMarkings();
                removeSiteMoveMarkings();
                Interface.boardUtils.updateBoardPower(0, 0);
            });
        };

        const changePower = val => {
            if (engineMode === DEPTH_MODE) { current_depth    = Number(val); GM_setValue(DB.current_depth,    current_depth);    }
            else                           { current_movetime = Number(val); GM_setValue(DB.current_movetime, current_movetime); }
            setEloDescription(eloEl);
        };

        if (depthRangeEl)       depthRangeEl.onchange       = () => changePower(depthRangeEl.value);
        if (depthRangeNumEl)    depthRangeNumEl.onchange    = () => changePower(depthRangeNumEl.value);
        if (moveTimeRangeEl)    moveTimeRangeEl.onchange    = () => changePower(moveTimeRangeEl.value);
        if (moveTimeRangeNumEl) moveTimeRangeNumEl.onchange = () => changePower(moveTimeRangeNumEl.value);
        if (maxMovesEl)         maxMovesEl.onchange         = () => { max_best_moves = Number(maxMovesEl.value); GM_setValue(DB.max_best_moves, max_best_moves); };

        if (nodeNameEl)       nodeNameEl.onchange       = () => { node_engine_name = nodeNameEl.value;   GM_setValue(DB.node_engine_name,    node_engine_name);    };
        if (nodeUrlEl)        nodeUrlEl.onchange        = () => { node_engine_url  = nodeUrlEl.value;    GM_setValue(DB.node_engine_url,     node_engine_url);     };
        if (useBookEl)        useBookEl.onchange        = () => { use_book_moves   = useBookEl.checked;  GM_setValue(DB.use_book_moves,      use_book_moves);      };
        if (showOppEl)        showOppEl.onchange        = () => { show_opposite_moves = showOppEl.checked;   GM_setValue(DB.show_opposite_moves, show_opposite_moves); };
        if (displayOnSiteEl)  displayOnSiteEl.onchange  = () => { displayMovesOnSite  = displayOnSiteEl.checked; GM_setValue(DB.displayMovesOnSite,  displayMovesOnSite);  };
        if (enableUserLogEl)  enableUserLogEl.onchange  = () => { enableUserLog   = enableUserLogEl.checked;   GM_setValue(DB.enableUserLog,   enableUserLog);   };
        if (enableEngineLogEl) enableEngineLogEl.onchange = () => { enableEngineLog = enableEngineLogEl.checked; GM_setValue(DB.enableEngineLog, enableEngineLog); };

        if (reloadEngineEl) reloadEngineEl.onchange = () => {
            reload_engine = reloadEngineEl.checked;
            if (reloadEveryDivEl) reloadEveryDivEl.style.display = reload_engine ? 'block' : 'none';
            GM_setValue(DB.reload_engine, reload_engine);
        };
        if (reloadEveryEl) reloadEveryEl.onchange = () => {
            reload_every = Number(reloadEveryEl.value);
            GM_setValue(DB.reload_every, reload_every);
        };

        window.onunload = () => { if (Gui.window && !Gui.window.closed) Gui.window.close(); };

        const closedCheck = setInterval(() => {
            if (Gui.window.closed) { clearInterval(closedCheck); engine?.terminate(); }
        }, 1000);

        Interface.log('GUI initialized!');
        observeNewMoves();
    });
}

function fixDepthMoveTimeInput(depthR, depthN, mtR, mtN, eloElem) {
    if (!depthR) return;
    const ff = isFirefox();
    const dm = engineMode === DEPTH_MODE;
    depthR.style.display = (!ff && dm)  ? 'block' : 'none';
    depthN.style.display = (ff  && dm)  ? 'block' : 'none';
    mtR.style.display    = (!ff && !dm) ? 'block' : 'none';
    mtN.style.display    = (ff  && !dm) ? 'block' : 'none';
    setEloDescription(eloElem);
}

// ─── Database init ────────────────────────────────────────────────────────────
async function initializeDatabase(callback) {
    const defaults = {
        nightMode: false, engineMode: 0, engineIndex: 0,
        reload_engine: false, reload_every: 10,
        enableUserLog: true, enableEngineLog: true,
        displayMovesOnSite: false, show_opposite_moves: false, use_book_moves: false,
        node_engine_url: 'http://localhost:5000', node_engine_name: 'stockfish-15.exe',
        current_depth: Math.round(MAX_DEPTH / 2), current_movetime: Math.round(MAX_MOVETIME / 3),
        max_best_moves: 1
    };

    const stored = await GM_getValue(DB.nightMode);

    // Write defaults on first run
    if (stored === undefined) {
        for (const [k, v] of Object.entries(defaults)) await GM_setValue(DB[k], v);
    }

    // Always read back from storage (handles both first-run and subsequent)
    nightMode          = await GM_getValue(DB.nightMode);
    engineMode         = await GM_getValue(DB.engineMode);
    engineIndex        = await GM_getValue(DB.engineIndex);
    reload_engine      = await GM_getValue(DB.reload_engine);
    reload_every       = await GM_getValue(DB.reload_every);
    enableUserLog      = await GM_getValue(DB.enableUserLog);
    enableEngineLog    = await GM_getValue(DB.enableEngineLog);
    displayMovesOnSite = await GM_getValue(DB.displayMovesOnSite);
    show_opposite_moves= await GM_getValue(DB.show_opposite_moves);
    use_book_moves     = await GM_getValue(DB.use_book_moves);
    node_engine_url    = await GM_getValue(DB.node_engine_url);
    node_engine_name   = await GM_getValue(DB.node_engine_name);
    current_depth      = await GM_getValue(DB.current_depth);
    current_movetime   = await GM_getValue(DB.current_movetime);
    max_best_moves     = await GM_getValue(DB.max_best_moves);

    callback();
}

// ─── Entry point ──────────────────────────────────────────────────────────────
function initialize() {
    Interface  = new InterfaceUtils();
    const LozzaUtils = new LozzaUtility();
    // expose LozzaUtils globally so getBestMoves can use it
    window._LozzaUtils = LozzaUtils;
    turn = Interface.getBoardOrientation();

    initializeDatabase(() =>
        loadChessEngine(() =>
            updatePlayerColor(() => {
                addGuiPages();
                openGUI();
            })
        )
    );
}

// Patch LozzaUtils reference to use the instance created in initialize()
// (avoids a separate global declaration)
Object.defineProperty(window, 'LozzaUtils', {
    get: () => window._LozzaUtils,
    configurable: true
});

if (typeof GM_registerMenuCommand === 'function') {
    GM_registerMenuCommand('Open Smart Chess Bot', () => {
        if (chessBoardElem) initialize();
    }, 's');
}

const waitForChessBoard = setInterval(() => {
    if (CURRENT_SITE === null || CURRENT_SITE === undefined) {
        if      (window.location.href.includes('lichess.org')) CURRENT_SITE = LICHESS_ORG;
        else if (window.location.href.includes('chess.com'))   CURRENT_SITE = CHESS_COM;
    }

    if (CURRENT_SITE === LICHESS_ORG) {
        boardElem      = document.querySelector('.cg-wrap');
        if (!boardElem) boardElem = document.querySelector('[data-board]');
        firstPieceElem = boardElem?.querySelector('piece') ?? boardElem?.querySelector('.cg-piece') ?? boardElem?.querySelector('[data-role]') ?? null;
    } else if (CURRENT_SITE === CHESS_COM) {
        boardElem      = document.querySelector('.board');
        firstPieceElem = document.querySelector('.piece');
    }

    if (boardElem && firstPieceElem && chessBoardElem !== boardElem) {
        chessBoardElem = boardElem;
        clearInterval(waitForChessBoard);
        initialize();
    }
}, 1000);
