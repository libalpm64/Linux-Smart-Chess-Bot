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
// @require     https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/content/jquery.js
// @require     https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/content/chessboard.js?v=2
// @resource    chessboard.css     https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/content/chessboard.css
// @run-at      document-start
// @inject-into content
// @downloadURL https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/smart-chess.js
// @updateURL   https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main/tampermonkey%20script/system_meta.js
// ==/UserScript==

const repositoryRawURL = 'https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main';
const engineBase = `${repositoryRawURL}/engines`;
const LICHESS_API = 'https://lichess.org/api/cloud-eval';
const CHESS_COM = 0;
const LICHESS_ORG = 1;
const TURN_UPDATE_FIX = true;

const MAX_DEPTH = 20;
const MIN_DEPTH = 1;
const MAX_MOVETIME = 2000;
const MIN_MOVETIME = 50;
const MAX_ELO = 3500;
const DEPTH_MODE = 0;
const MAX_LOGS = 50;

const DEFAULT_COOLDOWN = 0;
const MAX_COOLDOWN = 2000;
const DEFAULT_BYPASS = false;

const rank = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master', 'Grand Master'];

const ENGINE_RESOURCES = ['lozza.js', 'stockfish-5.js', 'stockfish-2018.js', 'tomitankChess.js', 'stockfish-18-asm.js'];
const ENGINE_NAMES = ['Lozza', 'Stockfish 5', 'Stockfish 2018', 'TomitankChess', 'Stockfish 18 ASM', 'go_server'];
const GO_ENGINE_NAME = ENGINE_NAMES[ENGINE_NAMES.length - 1];
const JS_ENGINE_COUNT = ENGINE_NAMES.length - 1;

const best_move_color = [0, 0, 250, 0.5];
const opposite_best_move_color = [250, 0, 0, 0.5];
const possible_moves_colors = [[200, 180, 0, 0.9], [150, 180, 0, 0.9], [100, 180, 0, 0.9], [50, 180, 0, 0.9]];
const opposite_possible_moves_colors = [[250, 200, 200, 0.9], [250, 150, 150, 0.9], [250, 100, 100, 0.9], [250, 50, 50, 0.9]];
const defaultFromSquareStyle = 'border:4px solid rgb(0 0 0/50%);';
const defaultToSquareStyle = 'border:4px dashed rgb(0 0 0/50%);';

const DB = {
    nightMode: 'nightMode', engineMode: 'engineMode', engineName: 'engineName',
    reload_every: 'reload_every', reload_engine: 'reload_engine',
    enableUserLog: 'enableUserLog', enableEngineLog: 'enableEngineLog',
    displayMovesOnSite: 'displayMovesOnSite', show_opposite_moves: 'show_opposite_moves',
    use_book_moves: 'use_book_moves', node_engine_url: 'node_engine_url',
    node_engine_name: 'node_engine_name', current_depth: 'current_depth',
    current_movetime: 'current_movetime', max_best_moves: 'max_best_moves',
    isAutoplay: 'isAutoplay', move_cooldown: 'move_cooldown', use_bezier_bypass: 'use_bezier_bypass'
};

let nightMode = false;
let engineMode = 0;
let engineName = ENGINE_NAMES[0];
let reload_every = 10;
let reload_engine = false;
let enableUserLog = true;
let enableEngineLog = true;
let displayMovesOnSite = false;
let show_opposite_moves = false;
let use_book_moves = false;
let node_engine_url = 'http://localhost:5000';
let node_engine_name = 'komodo-201-64';
let current_depth = Math.round(MAX_DEPTH / 2);
let current_movetime = Math.round(MAX_MOVETIME / 3);
let max_best_moves = 1;
let isAutoplay = false;
let move_cooldown = DEFAULT_COOLDOWN;
let use_bezier_bypass = DEFAULT_BYPASS;

let lastBestMoveID = 0;
let guiPagesAdded = false;
let closedGui = false;
let reload_count = 1;

let Interface = null;
let CURRENT_SITE = null;
let boardElem = null;
let firstPieceElem = null;
let forcedBestMove = false;
let engine = null;
let engineObjectURL = null;
let loadedEngineName = null;

let chessBoardElem = null;
let turn = '-';
let last_turn = null;
let playerColor = null;
let lastPlayerColor = null;
let isPlayerTurn = null;
let lastFen = null;

let activeGuiMoveHighlights = [];
let activeSiteMoveHighlights = [];
let possible_moves = [];

let engineLogNum = 1;


let userscriptLogNum = 1;
let enemyScore = 0;
let myScore = 0;

let activeRequestId = null;
let pendingRequest = null;
let isEngineBusy = false;
let currentEngineSearchId = null;
let lastRequestTime = 0;
let requestDebounceTimer = null;

const Gui = new UserGui();
Gui.settings.window.title = 'Smart Chess Bot';
Gui.settings.window.external = true;
Gui.settings.window.size = { width: 500, height: 620 };
Gui.settings.gui.external = { popup: true, style: '' };

Gui.settings.gui.external.style += GM_getResourceText('chessboard.css');
Gui.settings.gui.external.style += `
</style><style>
div[class^='board'] { background-color:#000; }
body { display:block; margin:0 auto; width:360px; }
#fen { margin-left:10px; }
#engine-log-container,
#userscript-log-container { max-height:30vh; overflow:auto !important; }
        .custom.highlight { pointer-events: none !important; }
        cg-container svg, cg-board svg, .cg-shapes, .cg-custom-svgs { pointer-events: none !important; }
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

const isFirefox = () => navigator.userAgent.toLowerCase().includes('firefox');
const alphabetPosition = ch => ch.charCodeAt(0) - 97;
const removeDuplicates = arr => [...new Set(arr)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function bezierCurve(t) {
    // Cubic bezier: easeOutCubic for natural human-like delays
    return 1 - Math.pow(1 - t, 3);
}

function getDelayedTime(baseDelay) {
    if (move_cooldown === 0) {
        return baseDelay;
    }

    if (!use_bezier_bypass) {
        return Math.max(baseDelay, move_cooldown);
    }

    // Generate bezier-random delay on top of move_cooldown
    const randomT = Math.random();
    const bezierValue = bezierCurve(randomT);
    const bezierDelay = move_cooldown * bezierValue;

    return move_cooldown + bezierDelay;
}

function getMouseDelay() {
    if (!use_bezier_bypass || move_cooldown === 0) {
        return 0;
    }

    // Natural mouse movement bezier curve
    const randomT = Math.random();
    const bezierValue = bezierCurve(randomT);
    // Mouse delays between 10-80ms with bezier distribution
    const mouseDelay = 10 + (bezierValue * 70);
    return Math.min(mouseDelay, move_cooldown / 10);
}

function fenSquareToChessComSquare(sq) {
    const [x, y] = sq.split('');
    return `square-${'abcdefgh'.indexOf(x) + 1}${y}`;
}

const pieceNameToFen = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };

function chessCoordinatesToIndex(coord) {
    if (!coord) return null;
    const x = coord.charCodeAt(0) - 97;
    const y = Number(coord.slice(1)) - 1;
    return [x, y];
}

function getLichessTurnFromMoveList() {
    // Live game move list (l4x kwdb elements)
    const liveMoves = document.querySelectorAll('l4x kwdb');
    if (liveMoves.length > 0) return liveMoves.length % 2 === 0 ? 'w' : 'b';

    // Puzzles (.tview2 move elements), Do not count indexs / fail moves.
    const puzzleMoves = document.querySelectorAll('.tview2 move:not(.fail)');
    if (puzzleMoves.length > 0) return puzzleMoves.length % 2 === 0 ? 'w' : 'b';

    // Fallback (If all else fails)
    const otherMoves = document.querySelectorAll('.puzzle__moves move:not(.fail), .move-list move:not(.fail)');
    if (otherMoves.length > 0) return otherMoves.length % 2 === 0 ? 'w' : 'b';

    return null;
}

function FenUtils() {
    this.getPieceOppositeColor = s => (s === s.toUpperCase() ? 'b' : 'w');

    this.getFenCodeFromPieceElem = elem => {
        if (CURRENT_SITE === CHESS_COM) return this.getChessComPieceFen(elem);
        if (CURRENT_SITE === LICHESS_ORG) return this.getLichessPieceFen(elem);
        return null;
    };

    this.squeezeEmptySquares = fen =>
        fen.replace(/11111111/g, '8').replace(/1111111/g, '7').replace(/111111/g, '6')
            .replace(/11111/g, '5').replace(/1111/g, '4').replace(/111/g, '3').replace(/11/g, '2');

    this.getLichessPieceFen = elem => {
        const pieceColor = elem.classList?.contains('white') ? 'w' : 'b';
        const elemPieceName = [...elem.classList]?.find(className => Object.keys(pieceNameToFen).includes(className));
        if (pieceColor && elemPieceName) {
            const pieceName = pieceNameToFen[elemPieceName];
            return pieceColor === 'w' ? pieceName.toUpperCase() : pieceName;
        }
        return null;
    };

    this.getChessComPieceFen = elem => {
        const cls = [...elem.classList].find(c => /^(b|w)[prnbqk]$/.test(c));
        if (!cls) return null;
        const [color, name] = cls.split('');
        return color === 'w' ? name.toUpperCase() : name.toLowerCase();
    };

    this.buildBoard = () => {
        if (CURRENT_SITE === LICHESS_ORG) {
            const fenInput = document.querySelector('.fen-pnl input, .analyse__controls input.fen, input[name="fen"]');
            if (fenInput && fenInput.value) {
                const fenStr = fenInput.value.trim().split(' ')[0];
                const rows = fenStr.split('/');
                const board = [];

                rows.forEach(rowStr => {
                    const row = [];
                    for (let char of rowStr) {
                        if (/\d/.test(char)) {
                            for (let i = 0; i < parseInt(char); i++) row.push(1);
                        } else {
                            row.push(char);
                        }
                    }
                    board.push(row);
                });
                return board;
            }
        }

        const board = Array.from({ length: 8 }, () => Array(8).fill(1));

        if (CURRENT_SITE === CHESS_COM) {
            const pieceElems = chessBoardElem?.querySelectorAll('.piece') || [];
            pieceElems.forEach(pieceElem => {
                const pieceFenCode = this.getChessComPieceFen(pieceElem);
                const m = pieceElem.className.match(/square-(\d)(\d)/);
                if (pieceFenCode && m) {
                    board[8 - Number(m[2])][Number(m[1]) - 1] = pieceFenCode;
                }
            });
            return board;
        }

        const cgContainer = document.querySelector('cg-container');
        if (!cgContainer) return board;

        const containerWidth = cgContainer.offsetWidth || parseInt(cgContainer.style.width) || 512;
        const squareSize = containerWidth / 8;
        const isFlipped = this.getBoardOrientation() === 'b';

        const pieceElems = cgContainer.querySelectorAll('piece:not(.ghost)');
        const pieceMap = {
            'white pawn': 'P', 'white knight': 'N', 'white bishop': 'B',
            'white rook': 'R', 'white queen': 'Q', 'white king': 'K',
            'black pawn': 'p', 'black knight': 'n', 'black bishop': 'b',
            'black rook': 'r', 'black queen': 'q', 'black king': 'k'
        };

        pieceElems.forEach(p => {
            const transform = p.style.transform;
            const vals = transform.match(/[\d.]+/g);
            if (!vals || vals.length < 2) return;

            let vCol = Math.round(parseFloat(vals[0]) / squareSize);
            let vRow = Math.round(parseFloat(vals[1]) / squareSize);

            let col = isFlipped ? (7 - vCol) : vCol;
            let row = isFlipped ? (7 - vRow) : vRow;

            if (col < 0 || col > 7 || row < 0 || row > 7) return;

            const key = Object.keys(pieceMap).find(k =>
                k.split(' ').every(cls => p.classList.contains(cls)));

            if (key) board[row][col] = pieceMap[key];
        });

        return board;
    };

    this.getBoardOrientation = () => {
        if (CURRENT_SITE === CHESS_COM) return chessBoardElem?.classList.contains('flipped') ? 'b' : 'w';
        if (CURRENT_SITE === LICHESS_ORG) {
            const cgWrap = document.querySelector('.cg-wrap');
            return cgWrap?.classList.contains('orientation-black') ? 'b' : 'w';
        }
        return 'w';
    };
    this.isMyTurn = () => {
        return this.getTurn() === this.getBoardOrientation();
    };
    this.getTurn = () => {
        if (CURRENT_SITE === LICHESS_ORG) {
            const fenInput = document.querySelector('.fen-pnl input, .analyse__controls input.fen, input[name="fen"]');
            if (fenInput && fenInput.value) {
                const parts = fenInput.value.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const turnChar = parts[1].toLowerCase();
                    if (turnChar === 'w' || turnChar === 'b') return turnChar;
                }
            }
            return getLichessTurnFromMoveList();
        }
        // Chess.com: use the robust DOM detection, fallback to global turn
        const domTurn = typeof getChessComTurnFromDOM === 'function' ? getChessComTurnFromDOM() : '';
        if (domTurn !== '') return domTurn;
        return typeof turn !== 'undefined' ? turn : 'w';
    };

    this.getBoardPiece = (fenCoord, board) => {
        const indexArr = chessCoordinatesToIndex(fenCoord);
        if (!indexArr) return null;
        return board?.[7 - indexArr[1]]?.[indexArr[0]];
    };

    this.getRights = board => {
        let r = '';
        const e1 = this.getBoardPiece('e1', board);
        const h1 = this.getBoardPiece('h1', board);
        const a1 = this.getBoardPiece('a1', board);
        const e8 = this.getBoardPiece('e8', board);
        const h8 = this.getBoardPiece('h8', board);
        const a8 = this.getBoardPiece('a8', board);
        if (e1 === 'K' && h1 === 'R') r += 'K';
        if (e1 === 'K' && a1 === 'R') r += 'Q';
        if (e8 === 'k' && h8 === 'r') r += 'k';
        if (e8 === 'k' && a8 === 'r') r += 'q';
        return r || '-';
    };

    this.getFen = () => {
        const board = this.buildBoard();
        const basicFen = this.squeezeEmptySquares(board.map(r => r.join('')).join('/'));
        const t = this.getTurn();
        const rights = this.getRights(board);
        return `${basicFen} ${t} ${rights} - 0 1`;
    };
}

function InterfaceUtils() {
    const cache = {};
    const $ = sel => Gui.document && (cache[sel] !== undefined ? cache[sel] : (cache[sel] = Gui.document.querySelector(sel)));

    this.boardUtils = {
        findSquareElem: code => Gui.document?.querySelector(`.square-${code}`),

        markMove: (from, to, color) => {
            if (!Gui?.document) return;

            [from, to].forEach((sq, i) => {
                const el = Interface.boardUtils.findSquareElem(sq);
                if (!el) return;

                el.style.transform = i === 0 ? 'scale(0.85)' : 'scale(0.95)';
                el.style.backgroundColor = `rgba(${color[0]},${color[1]},${color[2]},${color[3] || 0.5})`;
                el.style.transition = 'transform 0.05s ease-out, background-color 0.05s ease-out';

                activeGuiMoveHighlights.push(el);
            });

            if (displayMovesOnSite && isPlayerTurn)
                markMoveToSite(from, to, color);
        },

        removeBestMarkings: () => {
            activeGuiMoveHighlights.forEach(el => {
                el.style.transform = '';
                el.style.backgroundColor = '';
                el.style.transition = '';
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
        },

        updateEvalBar: (cp, mate, color) => {
            const fill = $('#eval-bar-fill');
            const text = $('#eval-bar-text');
            const container = $('#eval-bar-container');
            if (!fill || !text || !container) return;

            let percent = 50;
            let evalText = "0.0";

            let absoluteCp = cp;
            let absoluteMate = mate;

            if (turn === 'b' && cp !== undefined) absoluteCp = -cp;
            if (turn === 'b' && mate !== undefined) absoluteMate = -mate;

            if (absoluteMate !== undefined) {
                percent = absoluteMate > 0 ? 100 : 0;
                evalText = absoluteMate > 0 ? `M${Math.abs(absoluteMate)}` : `-M${Math.abs(absoluteMate)}`;
            } else if (absoluteCp !== undefined) {
                const score = absoluteCp / 100;
                evalText = score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1);
                percent = 50 + 50 * (2 / (1 + Math.exp(-0.004 * absoluteCp)) - 1);
            }

            if (color === 'b') {
                fill.style.height = `${100 - percent}%`;
                fill.style.backgroundColor = '#404040';
                container.style.backgroundColor = '#f2f2f2';
                text.style.color = (100 - percent) > 50 ? '#404040' : '#f2f2f2';
            } else {
                fill.style.height = `${percent}%`;
                fill.style.backgroundColor = '#f2f2f2';
                container.style.backgroundColor = '#404040';
                text.style.color = percent > 50 ? '#404040' : '#f2f2f2';
            }
            text.textContent = evalText;
        }
    };

    const appendLog = (containerId, str, num) => {
        const container = Gui.document?.querySelector(containerId);
        if (!container) return;
        const el = document.createElement('div');
        el.classList.add('list-group-item');
        if (str.includes('info')) el.classList.add('list-group-item-info');
        if (str.includes('bestmove')) el.classList.add('list-group-item-success');
        el.innerText = `#${num} ${str}`;
        if (container.children.length >= MAX_LOGS) container.lastChild.remove();
        container.prepend(el);
    };

    this.engineLog = str => { if (enableEngineLog) appendLog('#engine-log-container', str, engineLogNum++); };
    this.log = str => { if (enableUserLog) appendLog('#userscript-log-container', str, userscriptLogNum++); };

    this.getBoardOrientation = () => {
        if (CURRENT_SITE === CHESS_COM) return document.querySelector('.board.flipped') ? 'b' : 'w';
        if (CURRENT_SITE === LICHESS_ORG) {
            const cgWrap = document.querySelector('.cg-wrap');
            return cgWrap?.classList.contains('orientation-black') ? 'b' : 'w';
        }
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
    this.extractInfo = str => {
        const info = ['time', 'nps', 'depth', 'pv'].reduce((acc, key) => {
            const m = str.match(`${key} (\\d+)`);
            if (m) acc[key] = m[1];
            return acc;
        }, {});
        const cpMatch = str.match(/score cp (-?\d+)/);
        if (cpMatch) info.cp = parseInt(cpMatch[1], 10);
        const mateMatch = str.match(/score mate (-?\d+)/);
        if (mateMatch) info.mate = parseInt(mateMatch[1], 10);
        return info;
    };
}

let _lichessSvgLayer = null;
let _lichessArrowNodes = [];

function _getLichessSvgLayer() {
    if (_lichessSvgLayer && _lichessSvgLayer.isConnected) return _lichessSvgLayer;

    document.getElementById('scb-svg-hud')?.remove();
    _lichessArrowNodes = [];

    const cgWrap = document.querySelector('.cg-wrap');
    if (!cgWrap) return null;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'scb-svg-hud';
    Object.assign(svg.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        // Z-Index is high because it will opaque out Lichess's DOM element override
        zIndex: '100',
        overflow: 'visible',
    });
    svg.setAttribute('viewBox', '0 0 8 8');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const makeMarker = (id, color) => {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', id);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '8');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '3');
        marker.setAttribute('markerHeight', '3');
        marker.setAttribute('orient', 'auto');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        path.setAttribute('fill', color);
        marker.appendChild(path);
        return marker;
    };
    defs.appendChild(makeMarker('scb-head-blue', 'rgba(0,0,250,0.9)'));
    defs.appendChild(makeMarker('scb-head-red', 'rgba(250,0,0,0.9)'));
    defs.appendChild(makeMarker('scb-head-yellow', 'rgba(200,180,0,0.9)'));
    defs.appendChild(makeMarker('scb-head-orange', 'rgba(250,150,0,0.9)'));
    svg.appendChild(defs);

    const existingPos = window.getComputedStyle(cgWrap).position;
    if (existingPos === 'static') cgWrap.style.position = 'relative';

    cgWrap.appendChild(svg);
    _lichessSvgLayer = svg;
    return svg;
}

function _sqToSvgCoords(notation) {
    const wrap = document.querySelector('.cg-wrap');
    const isBlack = wrap?.classList.contains('orientation-black');
    const files = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };
    let x = files[notation[0]];
    let y = 8 - parseInt(notation[1]);
    if (isBlack) { x = 7 - x; y = 7 - y; }
    return (x === undefined || isNaN(y)) ? null : { x, y };
}

function _pickSvgMarker(rgba) {
    if (rgba[2] > rgba[0]) return 'scb-head-blue';
    if (rgba[0] >= 250) return 'scb-head-red';
    if (rgba[0] >= 200) return 'scb-head-yellow';
    return 'scb-head-orange';
}

function _drawLichessArrow(svg, fromSq, toSq, rgba, lineIndex) {
    const s = _sqToSvgCoords(fromSq);
    const e = _sqToSvgCoords(toSq);
    if (!s || !e) return;

    const strokeColor = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] ?? 0.85})`;
    const fillColor = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},0.15)`;

    const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    box.setAttribute('x', s.x + 0.05);
    box.setAttribute('y', s.y + 0.05);
    box.setAttribute('width', '0.9');
    box.setAttribute('height', '0.9');
    box.setAttribute('fill', fillColor);
    box.setAttribute('stroke', strokeColor);
    box.setAttribute('stroke-width', '0.06');
    svg.appendChild(box);
    _lichessArrowNodes.push(box);

    const x1 = s.x + 0.5, y1 = s.y + 0.5;
    const x2 = e.x + 0.5, y2 = e.y + 0.5;
    const bend = lineIndex * 0.18;
    let d;
    if (bend === 0) {
        d = `M ${x1} ${y1} L ${x2} ${y2}`;
    } else {
        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;
        const dx = x2 - x1, dy = y2 - y1;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const cx = midX - dy * (bend / dist);
        const cy = midY + dx * (bend / dist);
        d = `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
    }

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', lineIndex === 0 ? '0.13' : '0.09');
    path.setAttribute('marker-end', `url(#${_pickSvgMarker(rgba)})`);
    if (lineIndex > 0) path.setAttribute('stroke-dasharray', '0.12 0.08');
    svg.appendChild(path);
    _lichessArrowNodes.push(path);
}

function markMoveToSite(fromSq, toSq, rgba) {
    if (CURRENT_SITE === CHESS_COM) {
        const highlight = (sq, style) => {
            const cls = fenSquareToChessComSquare(sq);
            document.querySelector(`${TURN_UPDATE_FIX ? '.custom' : ''}.highlight.${cls}`)?.remove();
            const el = document.createElement('div');
            el.className = `custom highlight ${cls}`;
            el.dataset.testElement = 'highlight';
            el.style.cssText = style;
            el.style.backgroundColor = `rgba(${rgba.join(',')})`;
            el.style.pointerEvents = 'none';
            activeSiteMoveHighlights.push(el);
            chessBoardElem.prepend(el);
        };
        highlight(fromSq, defaultFromSquareStyle);
        highlight(toSq, defaultToSquareStyle);
        return;
    }

    if (CURRENT_SITE === LICHESS_ORG) {
        const svg = _getLichessSvgLayer();
        if (!svg) return;
        const lineIndex = Math.floor(_lichessArrowNodes.length / 2);
        _drawLichessArrow(svg, fromSq, toSq, rgba, lineIndex);
    }
}

function removeSiteMoveMarkings() {
    activeSiteMoveHighlights.forEach(el => el?.remove());
    activeSiteMoveHighlights = [];

    _lichessArrowNodes.forEach(n => n?.remove());
    _lichessArrowNodes = [];
}

function playMoveOnSite(from, to, promotion = '') {
    if (CURRENT_SITE === LICHESS_ORG) {
        return;
    }

    if (!new FenUtils().isMyTurn()) {
        Interface.log('Autoplay: Not my turn, skipping move.');
        return;
    }

    playerColor = Interface.getBoardOrientation();
    const board = document.querySelector('cg-container, wc-chess-board, chess-board, cg-board, .board, #board') || chessBoardElem;
    if (!board) return;

    const boardRect = board.getBoundingClientRect();
    const isWhite = playerColor === 'w';

    const getCoords = (sq) => {
        const file = sq.charCodeAt(0) - 97;
        const rank = parseInt(sq[1]) - 1;
        const x = isWhite ? file : 7 - file;
        const y = isWhite ? 7 - rank : rank;
        const sqSize = boardRect.width / 8;
        return {
            clientX: boardRect.left + (x + 0.5) * sqSize,
            clientY: boardRect.top + (y + 0.5) * sqSize
        };
    };

    const fromCoords = getCoords(from);
    const toCoords = getCoords(to);

    const emit = (type, coords, buttons) => {
        const opts = {
            bubbles: true, cancelable: true,
            clientX: coords.clientX, clientY: coords.clientY,
            screenX: coords.clientX, screenY: coords.clientY,
            buttons: buttons, isPrimary: true,
            pointerId: 1, pointerType: 'mouse',
            width: 1, height: 1, pressure: buttons ? 0.5 : 0
        };

        const target = document.elementFromPoint(coords.clientX, coords.clientY) || board;
        target.dispatchEvent(new PointerEvent(type, opts));
        board.dispatchEvent(new PointerEvent(type, opts));

        target.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts));
        board.dispatchEvent(new MouseEvent(type.replace('pointer', 'mouse'), opts));
    };

    Interface.log(`Autoplay: ${from} to ${to}`);

    // Add mouse bezier delays if enabled
    if (use_bezier_bypass && move_cooldown > 0) {
        const mouseDelay1 = getMouseDelay();
        const mouseDelay2 = getMouseDelay();
        const mouseDelay3 = getMouseDelay();

        setTimeout(() => emit('pointerdown', fromCoords, 1), mouseDelay1);
        setTimeout(() => emit('pointerup', fromCoords, 0), mouseDelay1 + 10);
        setTimeout(() => emit('pointerdown', toCoords, 1), mouseDelay1 + mouseDelay2 + 20);
        setTimeout(() => emit('pointerup', toCoords, 0), mouseDelay1 + mouseDelay2 + mouseDelay3 + 30);

        if (promotion) {
            setTimeout(() => {
                const color = playerColor;
                const promoElem = CURRENT_SITE === CHESS_COM
                    ? document.querySelector(`.promotion-piece.${color}${promotion}`)
                    : (document.querySelector(`.promotion-pane [data-piece="${promotion}"]`) ||
                        document.querySelector(`.cg-wrap .promotion [data-piece="${promotion}"]`));
                if (promoElem) promoElem.click();
            }, mouseDelay1 + mouseDelay2 + mouseDelay3 + 100);
        }
    } else {
        emit('pointerdown', fromCoords, 1);
        emit('pointerup', fromCoords, 0);
        emit('pointerdown', toCoords, 1);
        emit('pointerup', toCoords, 0);

        if (promotion) {
            const color = playerColor;
            const promoElem = CURRENT_SITE === CHESS_COM
                ? document.querySelector(`.promotion-piece.${color}${promotion}`)
                : (document.querySelector(`.promotion-pane [data-piece="${promotion}"]`) ||
                    document.querySelector(`.cg-wrap .promotion [data-piece="${promotion}"]`));
            if (promoElem) promoElem.click();
        }
    }
}

function getChessComTurnFromDOM() {
    const moveList = document.querySelector('wc-simple-move-list');
    if (moveList) {
        const selectedNode = moveList.querySelector('div.node:has(.selected), div.node .selected');
        if (selectedNode) {
            const node = selectedNode.closest('.node') || selectedNode;
            if (node.classList.contains('white-move')) return 'b';
            if (node.classList.contains('black-move')) return 'w';
        }
        const nodes = moveList.querySelectorAll('div.node');
        if (nodes.length > 0) return nodes.length % 2 === 0 ? 'w' : 'b';
    }

    const activeClock = document.querySelector('div.clock-player-turn, .clock-white.running, .clock-black.running');
    if (activeClock) {
        if (activeClock.classList.contains('clock-white') || activeClock.classList.contains('white')) return 'w';
        if (activeClock.classList.contains('clock-black') || activeClock.classList.contains('black')) return 'b';
    }
    return '';
}

function getTurn() {
    Interface.boardUtils.removeBestMarkings();
    removeSiteMoveMarkings();

    if (CURRENT_SITE === CHESS_COM) {
        const domTurn = getChessComTurnFromDOM();
        if (domTurn !== '') return domTurn;
    }

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

function getElo() {
    const ratio = engineMode === DEPTH_MODE ? current_depth / MAX_DEPTH : current_movetime / MAX_MOVETIME;
    return Math.round(MAX_ELO * ratio);
}

function getRank() {
    const ratio = engineMode === DEPTH_MODE ? current_depth / MAX_DEPTH : current_movetime / MAX_MOVETIME;
    const idx = Math.min(Math.round(ratio * rank.length), rank.length - 1);
    return rank[idx];
}

function setEloDescription(eloElem) {
    if (!eloElem) return;
    eloElem.querySelector('#value').innerText = `Elo: ${getElo()}`;
    eloElem.querySelector('#rank').innerText = `Rank: ${getRank()}`;
    eloElem.querySelector('#power').innerText = engineMode === DEPTH_MODE
        ? `Depth: ${current_depth}` : `Move Time: ${current_movetime}`;
}

function clearBoard() {
    Interface.stopBestMoveProcessingAnimation();
    Interface.boardUtils.removeBestMarkings();
    removeSiteMoveMarkings();
}

function moveResult(from, to, power, clear = true, promotion = '') {
    if (!from || !to || from.length < 2 || to.length < 2) return;
    if (clear) clearBoard();

    if (!forcedBestMove) {
        if (isPlayerTurn) myScore += Number(power);
        else enemyScore += Number(power);
        Interface.boardUtils.updateBoardPower(myScore, enemyScore);
    } else {
        forcedBestMove = false;
        const btn = Gui.document?.querySelector('#bestmove-btn');
        if (btn) btn.disabled = false;
    }

    const extras = removeDuplicates(possible_moves).slice(0, max_best_moves - 1);
    extras.forEach((mv, i) => {
        Interface.boardUtils.markMove(
            mv.slice(0, 2), mv.slice(2, 4),
            isPlayerTurn ? possible_moves_colors[i] : opposite_possible_moves_colors[i]
        );
    });
    Interface.boardUtils.markMove(from, to, isPlayerTurn ? best_move_color : opposite_best_move_color);
    Interface.stopBestMoveProcessingAnimation();

    if (isAutoplay && isPlayerTurn && CURRENT_SITE === CHESS_COM) {
        const delay = getDelayedTime(50); // Base 50ms + bezier cooldown
        setTimeout(() => playMoveOnSite(from, to, promotion), delay);
    }
}

const START_FEN_W = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const START_FEN_B = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1';

function updateBoard(clear = true) {
    if (clear) clearBoard();

    const fenUtil = new FenUtils();
    const fen = fenUtil.getFen();
    const currentTurn = fen.split(' ')[1]; // 'w' or 'b'

    // Reset scores on start position
    if (fen.startsWith('rnbqkbnr')) {
        enemyScore = myScore = 0;
        Interface.boardUtils.updateBoardPower(0, 0);
    }

    // If I am White ('w') and Turn is 'w', it is MY turn.
    // If I am Black ('b') and Turn is 'b', it is MY turn.
    isPlayerTurn = (currentTurn === playerColor);

    // Update Global State
    last_turn = currentTurn;
    turn = currentTurn;

    Interface.boardUtils.updateBoardFen(fen);
}

function sendBestMove() {
    const fenUtil = new FenUtils();
    const actualTurn = fenUtil.getTurn();

    if (actualTurn === null) {
        Interface.log('Turn unknown, skipping.');
        return;
    }

    if (actualTurn !== playerColor) {
        Interface.log(`Not your turn (turn=${actualTurn}, you=${playerColor}), skipping.`);
        return;
    }

    isPlayerTurn = true;

    const currentFen = fenUtil.getFen();
    if (!currentFen || currentFen.startsWith('8/8/8/8/8/8/8/8')) {
        Interface.log('FEN appears empty, skipping engine request.');
        return;
    }

    if (requestDebounceTimer) {
        clearTimeout(requestDebounceTimer);
    }

    const processRequest = () => {
        const latestFen = fenUtil.getFen();

        // If engine is busy or we have a pending request, just update the pending FEN
        if ((isEngineBusy || pendingRequest) && engineName === 'Stockfish 18 ASM') {
            pendingRequest = { fen: latestFen };
            return;
        }

        // Ratelimit request
        const now = Date.now();
        const ratelimit = isAutoplay ? 50 : 1000;
        if (now - lastRequestTime < ratelimit && engineName === 'Stockfish 18 ASM') {
            requestDebounceTimer = setTimeout(processRequest, ratelimit - (now - lastRequestTime));
            return;
        }

        lastRequestTime = now;

        // Terminate existing search for Stockfish 18 ASM
        if (engine && engineName === 'Stockfish 18 ASM' && currentEngineSearchId !== null) {
            try {
                const oldEngine = engine;
                engine = null;
                loadedEngineName = null;
                oldEngine.terminate();
            } catch (e) {
                Interface.log('Error terminating engine: ' + e);
            }
            setTimeout(() => {
                startEngineSearch(latestFen);
            }, 200);
            return;
        }

        startEngineSearch(latestFen);
    };

    requestDebounceTimer = setTimeout(processRequest, 50);
}

function startEngineSearch(fen) {
    possible_moves = [];
    lastBestMoveID++;
    const req = { id: lastBestMoveID, fen: fen };
    activeRequestId = lastBestMoveID;
    currentEngineSearchId = lastBestMoveID;
    isEngineBusy = true;

    const executeSearch = () => {
        if (engine && loadedEngineName === engineName) {
            Interface.log(`Your turn (${playerColor}). Sending best-move request… (ID: ${req.id})`);
            use_book_moves ? getBookMoves(req) : getBestMoves(req);
        } else {
            loadChessEngine(false, () => {
                Interface.log(`Your turn (${playerColor}). Sending best-move request… (ID: ${req.id})`);
                use_book_moves ? getBookMoves(req) : getBestMoves(req);
            });
        }
    };

    // If engine is null wait for reload
    if (!engine && loadedEngineName !== engineName) {
        let attempts = 0;
        const checkEngine = setInterval(() => {
            attempts++;
            if (engine && loadedEngineName === engineName) {
                clearInterval(checkEngine);
                executeSearch();
            } else if (attempts > 50) { // 5 seconds timeout
                clearInterval(checkEngine);
                Interface.log('Engine load timeout, retrying...');
                loadChessEngine(true, () => executeSearch());
            }
        }, 100);
    } else {
        executeSearch();
    }

    // Safety timeout
    setTimeout(() => {
        if (isEngineBusy && engineName === 'Stockfish 18 ASM' && activeRequestId === req.id) {
            isEngineBusy = false;
            activeRequestId = null;
            currentEngineSearchId = null;
            if (pendingRequest) {
                const pending = pendingRequest;
                pendingRequest = null;
                sendBestMove();
            }
        }
    }, 20000);
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

function safeParseJSON(text) {
    try {
        const trimmed = (text || '').trim();
        if (!trimmed || trimmed[0] === '<') return null;
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
            moveResult(move.slice(0, 2), move.slice(2, 4), current_depth, true);

            isEngineBusy = false;
            activeRequestId = null;
        },
        onerror: () => {
            if (lastBestMoveID === request.id) getBestMoves(request);
        }
    });
}

function getNodeBestMoves(request) {
    const url = `${node_engine_url}/getBestMove?fen=${encodeURIComponent(request.fen)}`
        + `&engine_mode=${engineMode}&depth=${current_depth}&movetime=${current_movetime}`
        + `&turn=${encodeURIComponent(last_turn || turn)}&engine=${encodeURIComponent(node_engine_name)}`;
    GM_xmlhttpRequest({
        method: 'GET', url,
        onload: res => {
            console.log('Response status:', res.status, 'response:', res.response);
            if (lastBestMoveID !== request.id) return;
            if (res.status !== 200) {
                resetBestMoveBtn();
                isEngineBusy = false;
                activeRequestId = null;
                Interface.log('Server error: ' + res.status);
                return;
            }
            if (!res.response || res.response === 'false') {
                resetBestMoveBtn();
                isEngineBusy = false;
                activeRequestId = null;
                Interface.log('Server returned empty');
                return;
            }
            const data = safeParseJSON(res.response);
            if (!data) {
                resetBestMoveBtn();
                isEngineBusy = false;
                activeRequestId = null;
                Interface.log('Invalid JSON: ' + (res.response || '').slice(0, 50));
                return;
            }
            console.log('Parsed data:', data);
            const { depth, movetime } = data;
            let move = data.move;
            let cp = undefined;
            let mate = undefined;

            if (data.lines && data.lines.length > 0) {
                const bestLine = data.lines[0];
                if (bestLine.moves && bestLine.moves.length > 0) {
                    move = bestLine.moves[0];
                }
                if (bestLine.scoreType === 'cp') cp = bestLine.score;
                if (bestLine.scoreType === 'mate') mate = bestLine.score;
            }

            console.log('Server response:', data);
            if (!move || move.length < 4) {
                resetBestMoveBtn();
                isEngineBusy = false;
                activeRequestId = null;
                Interface.log('Server returned invalid move.');
                return;
            }

            if (cp !== undefined || mate !== undefined) {
                Interface.boardUtils.updateEvalBar(cp, mate, playerColor);
            }
            if (move === 'e2e4' && request.fen.includes('8/p7/')) {
                Interface.log('Skipping bad FEN response');
                isEngineBusy = false;
                activeRequestId = null;
                return;
            }
            Interface.log(`Got move: ${move}, depth: ${depth}, engine: ${node_engine_name}`);
            Interface.updateBestMoveProgress(
                engineMode === DEPTH_MODE ? `Depth: ${depth}` : `Move time: ${movetime || 500} ms`);
            moveResult(move.slice(0, 2), move.slice(2, 4), depth || 10, true, move[4]);

            isEngineBusy = false;
            activeRequestId = null;
        },
        onerror: res => {
            console.log('Request failed:', res);
            resetBestMoveBtn();
            isEngineBusy = false;
            activeRequestId = null;
            Interface.log('Request failed: ' + JSON.stringify(res));
        }
    });
}

function getBestMoves(request) {
    if (engineName === GO_ENGINE_NAME)
        return getNodeBestMoves(request);

    if (!engine) return;

    // Check if this request was superseded by a newer one
    if (activeRequestId !== request.id) {
        Interface.log(`Ignoring stale request ${request.id} (current: ${activeRequestId})`);
        isEngineBusy = false;
        activeRequestId = null;
        currentEngineSearchId = null;
        return;
    }

    engine.postMessage('position fen ' + request.fen);
    engine.postMessage(engineMode === DEPTH_MODE
        ? `go depth ${current_depth}` : `go movetime ${current_movetime}`);

    engine.onmessage = e => {
        // Ignore responses from cancelled requests
        if (activeRequestId !== request.id) {
            Interface.log(`Ignoring stale engine response for request ${request.id}`);
            return;
        }

        const data = e.data;
        if (data.includes('bestmove')) {
            const move = data.split(' ')[1];
            moveResult(move.slice(0, 2), move.slice(2, 4), current_depth, true, move[4]);
            isEngineBusy = false;
            activeRequestId = null;
            currentEngineSearchId = null;

            if (pendingRequest) {
                const pending = pendingRequest;
                pendingRequest = null;
                setTimeout(() => sendBestMove(), 100);
            }
        } else if (data.includes('info')) {
            const info = LozzaUtils.extractInfo(data);
            const pvMove = data.includes('pv') ? data.slice(data.lastIndexOf('pv')).split(' ')[1] : null;
            if (pvMove) possible_moves.push(pvMove);
            Interface.updateBestMoveProgress(
                engineMode === DEPTH_MODE
                    ? `Depth: ${info.depth || current_depth}`
                    : `Move time: ${info.time || current_movetime} ms`);
            if (info.cp !== undefined || info.mate !== undefined) {
                Interface.boardUtils.updateEvalBar(info.cp, info.mate, playerColor);
            }
        }
        Interface.engineLog(data);
    };
}

function loadChessEngine(forced = false, callback) {
    if (engineName === GO_ENGINE_NAME) {
        Interface.log('Using Go server: ' + engineName);
        loadedEngineName = engineName;
        callback();
        return;
    }

    const engineIndex = ENGINE_NAMES.indexOf(engineName);
    const needsReload = forced || loadedEngineName !== engineName || (reload_engine && reload_count >= reload_every);
    if (!needsReload) {
        reload_count++;
        callback();
        return;
    }

    if (needsReload) {
        reload_count = 1;
        Interface.log('Reloading chess engine: ' + engineName);
        engine?.terminate();
    }

    if (engineIndex < 0) {
        Interface.log('Unknown engine: ' + engineName);
        callback();
        return;
    }

    const resourceName = ENGINE_RESOURCES[engineIndex];
    fetch(`${engineBase}/js/${resourceName}`).then(r => r.text()).then(src => {
        engineObjectURL = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
        loadedEngineName = engineName;
        engine = new Worker(engineObjectURL);
        engine.postMessage('ucinewgame');
        Interface.log(`Loaded engine: ${engineName}`);
    }).catch(e => {
        Interface.log(`Failed to load ${engineName}: ` + e);
    });
    callback();
}

function reloadChessEngine(forced, callback) {
    const needsReload = forced || loadedEngineName !== engineName || (reload_engine && reload_count >= reload_every);
    if (!needsReload) {
        reload_count++;
        callback();
        return;
    }
    reload_count = 1;
    Interface.log('Reloading: ' + engineName);
    engine?.terminate();
    loadChessEngine(forced, callback);
}

function updatePlayerColor(callback) {
    playerColor = Interface.getBoardOrientation();
    turn = playerColor;
    Interface.boardUtils.updateBoardOrientation(playerColor);
    callback();
}

function observeNewMoves() {
    const fenUtil = new FenUtils();

    // Returns 'w' or 'b' for whose clock is currently "running"
    // by checking which rclock element has the "running" class.
    function getLichessActiveColor() {
        if (document.querySelector('.rclock-white.running, .rclock-white .bar.active')) return 'w';
        if (document.querySelector('.rclock-black.running, .rclock-black .bar.active')) return 'b';
        if (document.querySelector('.rclock-bottom.running')) return playerColor;
        if (document.querySelector('.rclock-top.running')) return playerColor === 'w' ? 'b' : 'w';
        // Fallback: read from FEN
        return fenUtil.getFen().split(' ')[1] || 'w';
    }

    updateBoard(false);
    setTimeout(() => sendBestMove(), 300);

    let debounceTimer = null;
    const onBoardChange = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            // Always read playerColor in case we moved to a new puzzle
            const newPlayerColor = new FenUtils().getBoardOrientation();
            if (newPlayerColor !== playerColor) {
                playerColor = newPlayerColor;
                Interface.boardUtils.updateBoardOrientation(playerColor);
                Interface.log(`Player color updated to ${playerColor}`);
            }

            const newFen = fenUtil.getFen();
            if (newFen === lastFen) return;
            lastFen = newFen;

            updateBoard(false);

            const actualTurn = fenUtil.getTurn();
            if (actualTurn === playerColor) {
                removeSiteMoveMarkings();
                Interface.boardUtils.removeBestMarkings();
                sendBestMove();
            } else {
                removeSiteMoveMarkings();
                Interface.boardUtils.removeBestMarkings();
                Interface.log(`Opponent's turn (${actualTurn}), cleared highlights.`);
            }
        }, 20);
    };

    const cgWrap = document.querySelector('.cg-wrap') || chessBoardElem;
    if (cgWrap) {
        new MutationObserver(onBoardChange).observe(cgWrap, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
    }

    const fenInput = document.querySelector(
        '.fen-pnl input, .analyse__controls input.fen, input[name="fen"]'
    );
    if (fenInput) {
        new MutationObserver(onBoardChange).observe(fenInput, {
            attributes: true,
            attributeFilter: ['value'],
        });
        fenInput.addEventListener('input', onBoardChange);
        fenInput.addEventListener('change', onBoardChange);
    }

    if (CURRENT_SITE === LICHESS_ORG) {
        let lastActiveColor = null;

        setInterval(() => {
            const newPlayerColor = new FenUtils().getBoardOrientation();
            if (newPlayerColor !== playerColor) {
                playerColor = newPlayerColor;
                Interface.boardUtils.updateBoardOrientation(playerColor);
                Interface.log(`Player color updated to ${playerColor}`);
            }

            const activeColor = getLichessActiveColor();
            if (activeColor === lastActiveColor) return;
            lastActiveColor = activeColor;
            Interface.log(`Clock switched to ${activeColor} (you=${playerColor})`);

            if (activeColor === playerColor) {
                removeSiteMoveMarkings();
                Interface.boardUtils.removeBestMarkings();

                setTimeout(() => {
                    updateBoard(false);
                    sendBestMove();
                }, 50);
            } else {
                removeSiteMoveMarkings();
                Interface.boardUtils.removeBestMarkings();
            }
        }, 50);
    } else if (CURRENT_SITE === CHESS_COM) {
        // Safety for chess.com to catch moves if mutation observer misses them
        setInterval(() => {
            const newFen = fenUtil.getFen();
            if (newFen !== lastFen) {
                onBoardChange();
            } else if (isAutoplay && !isEngineBusy) {
                const actualTurn = fenUtil.getTurn();
                if (actualTurn === playerColor) {
                    sendBestMove();
                }
            }
        }, 1000);
    }
    // force re-eval on the position if the user plays the wrong move.
    if (CURRENT_SITE === LICHESS_ORG) {
        new MutationObserver(() => {
            const feedback = document.querySelector('.puzzle__feedback');
            if (feedback?.classList.contains('fail')) {
                lastFen = null;
                Interface.log('Wrong move detected, re-analyzing…');
                setTimeout(() => {
                    updateBoard(false);
                    sendBestMove();
                }, 50);
            }
        }).observe(document.body, {
            subtree: true,
            attributes: true,
            attributeFilter: ['class'],
        });
    }
    Interface.log('observeNewMoves: observers attached (auto-move enabled).');
}

function applyNightMode() {
    if (!Gui.document) return;
    const toggleSel = (sel, multi) => {
        const els = multi
            ? [...Gui.document.querySelectorAll(sel)]
            : [Gui.document.querySelector(sel)].filter(Boolean);
        els.forEach(el => el.classList.toggle('night', nightMode));
    };
    toggleSel('body', false);
    toggleSel('.card', true);
    toggleSel('.card-title', true);
    toggleSel('.form-control', true);
    toggleSel('label', true);
    toggleSel('.checkmark', true);
    toggleSel('input', true);
    toggleSel('.list-group', true);
    toggleSel('.card-footer', true);
    toggleSel('#fen', false);
    toggleSel('.nav-tabs .nav-link', true);
}

// GUI pages
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
.form-range { -webkit-appearance: none; width: 100%; height: 8px; background: #ddd; border-radius: 10px; outline: none; margin: 15px 0; }
.form-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 22px; height: 22px; background: #2196F3; cursor: pointer; border-radius: 50%; border: 4px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: .1s; }
.form-range::-webkit-slider-thumb:hover { transform: scale(1.1); }
.night .form-range { background: #444; }
.night .form-range::-webkit-slider-thumb { border-color: #545454; }
</style>`;

const engineOptionsHtml = ENGINE_NAMES.map(n => `<option>${n}</option>`).join('')

function addGuiPages() {
    if (guiPagesAdded) return;
    guiPagesAdded = true;


    Gui.addPage('Main', `
    <div class="rendered-form" id="main-tab">
      <div class="card">
        <div class="card-body" id="chessboard-card">
          <div class="main-title-bar">
            <h4 class="card-title">Live Chessboard</h4>
            <p class="card-title" id="best-move-progress"></p>
          </div>
          <div style="display: flex; align-items: stretch;">
            <div id="eval-bar-container" style="width: 25px; background-color: #404040; margin-right: 15px; border-radius: 4px; overflow: hidden; position: relative;">
              <div id="eval-bar-fill" style="width: 100%; height: 50%; background-color: #f2f2f2; position: absolute; bottom: 0; transition: height 0.5s ease-in-out, background-color 0.5s;"></div>
              <div id="eval-bar-text" style="position: absolute; top: 50%; width: 100%; text-align: center; transform: translateY(-50%); font-size: 11px; font-weight: bold; color: #fff; mix-blend-mode: difference; z-index: 1; white-space: nowrap;">0.0</div>
            </div>
            <div id="board" style="width:407px"></div>
          </div>
        </div>
        <div id="orientation" class="hidden"></div>
        <div class="card-footer sideways-card" style="display: flex; gap: 8px;">
          <input class="btn" style="flex: 1;" type="button" value="Get Best Move" id="bestmove-btn">
        </div>
        <div class="card-footer sideways-card">FEN: <div id="fen"></div></div>
        <div class="card-footer sideways-card">ENEMY SCORE: <div id="enemy-score">0</div></div>
        <div class="card-footer sideways-card">MY SCORE: <div id="my-score">0</div></div>
      </div>
    </div>`);

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
          <div id="reload-engine-div" style="display:${engineName === GO_ENGINE_NAME ? 'none' : 'block'}">
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
          <div id="node-engine-div" style="display:${engineName === GO_ENGINE_NAME ? 'block' : 'none'}">
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
          <div id="max-moves-div" style="display:${engineName === GO_ENGINE_NAME ? 'none' : 'block'}">
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
          <label class="container">Autoplay (Chess.com only)
            <input type="checkbox" id="autoplay-checkbox" ${isAutoplay ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
          <div class="space"></div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <label style="margin: 0; font-weight: bold; font-size: 14px;">Move Cooldown</label>
            <span id="cooldown-value" style="font-weight: bold; color: #2196F3; font-size: 14px;">${move_cooldown}ms</span>
          </div>
          <input type="range" class="form-range" min="0" max="${MAX_COOLDOWN}" step="50" value="${move_cooldown}" id="cooldown-slider">
          <label class="container">Bypass
              <input type="checkbox" id="bezier-bypass" ${use_bezier_bypass ? 'checked' : ''}>
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

const PIECES_B64 = {
    "bB": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+DQo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPg0KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1Ij4NCiAgPGcgc3R5bGU9Im9wYWNpdHk6MTsgZmlsbDpub25lOyBmaWxsLXJ1bGU6ZXZlbm9kZDsgZmlsbC1vcGFjaXR5OjE7IHN0cm9rZTojMDAwMDAwOyBzdHJva2Utd2lkdGg6MS41OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgc3Ryb2tlLWxpbmVqb2luOnJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDo0OyBzdHJva2UtZGFzaGFycmF5Om5vbmU7IHN0cm9rZS1vcGFjaXR5OjE7IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLDAuNikiPg0KICAgIDxnIHN0eWxlPSJmaWxsOiMwMDAwMDA7IHN0cm9rZTojMDAwMDAwOyBzdHJva2UtbGluZWNhcDpidXR0OyI+DQogICAgICA8cGF0aCBkPSJNIDksMzYgQyAxMi4zOSwzNS4wMyAxOS4xMSwzNi40MyAyMi41LDM0IEMgMjUuODksMzYuNDMgMzIuNjEsMzUuMDMgMzYsMzYgQyAzNiwzNiAzNy42NSwzNi41NCAzOSwzOCBDIDM4LjMyLDM4Ljk3IDM3LjM1LDM4Ljk5IDM2LDM4LjUgQyAzMi42MSwzNy41MyAyNS44OSwzOC45NiAyMi41LDM3LjUgQyAxOS4xMSwzOC45NiAxMi4zOSwzNy41MyA5LDM4LjUgQyA3LjY1LDM4Ljk5IDYuNjgsMzguOTcgNiwzOCBDIDcuMzUsMzYuNTQgOSwzNiA5LDM2IHoiLz4NCiAgICAgIDxwYXRoIGQ9Ik0gMTUsMzIgQyAxNy41LDM0LjUgMjcuNSwzNC41IDMwLDMyIEMgMzAuNSwzMC41IDMwLDMwIDMwLDMwIEMgMzAsMjcuNSAyNy41LDI2IDI3LjUsMjYgQyAzMywyNC41IDMzLjUsMTQuNSAyMi41LDEwLjUgQyAxMS41LDE0LjUgMTIsMjQuNSAxNy41LDI2IEMgMTcuNSwyNiAxNSwyNy41IDE1LDMwIEMgMTUsMzAgMTQuNSwzMC41IDE1LDMyIHoiLz4NCiAgICAgIDxwYXRoIGQ9Ik0gMjUgOCBBIDIuNSAyLjUgMCAxIDEgIDIwLDggQSAyLjUgMi41IDAgMSAxICAyNSA4IHoiLz4NCiAgICA8L2c+DQogICAgPHBhdGggZD0iTSAxNy41LDI2IEwgMjcuNSwyNiBNIDE1LDMwIEwgMzAsMzAgTSAyMi41LDE1LjUgTCAyMi41LDIwLjUgTSAyMCwxOCBMIDI1LDE4IiBzdHlsZT0iZmlsbDpub25lOyBzdHJva2U6I2ZmZmZmZjsgc3Ryb2tlLWxpbmVqb2luOm1pdGVyOyIvPg0KICA8L2c+DQo8L3N2Zz4NCg==",
    "bK": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+CiAgPGcgc3R5bGU9ImZpbGw6bm9uZTsgZmlsbC1vcGFjaXR5OjE7IGZpbGwtcnVsZTpldmVub2RkOyBzdHJva2U6IzAwMDAwMDsgc3Ryb2tlLXdpZHRoOjEuNTsgc3Ryb2tlLWxpbmVjYXA6cm91bmQ7c3Ryb2tlLWxpbmVqb2luOnJvdW5kO3N0cm9rZS1taXRlcmxpbWl0OjQ7IHN0cm9rZS1kYXNoYXJyYXk6bm9uZTsgc3Ryb2tlLW9wYWNpdHk6MTsiPgogICAgPHBhdGggZD0iTSAyMi41LDExLjYzIEwgMjIuNSw2IiBzdHlsZT0iZmlsbDpub25lOyBzdHJva2U6IzAwMDAwMDsgc3Ryb2tlLWxpbmVqb2luOm1pdGVyOyIgaWQ9InBhdGg2NTcwIi8+CiAgICA8cGF0aCBkPSJNIDIyLjUsMjUgQyAyMi41LDI1IDI3LDE3LjUgMjUuNSwxNC41IEMgMjUuNSwxNC41IDI0LjUsMTIgMjIuNSwxMiBDIDIwLjUsMTIgMTkuNSwxNC41IDE5LjUsMTQuNSBDIDE4LDE3LjUgMjIuNSwyNSAyMi41LDI1IiBzdHlsZT0iZmlsbDojMDAwMDAwO2ZpbGwtb3BhY2l0eToxOyBzdHJva2UtbGluZWNhcDpidXR0OyBzdHJva2UtbGluZWpvaW46bWl0ZXI7Ii8+CiAgICA8cGF0aCBkPSJNIDEyLjUsMzcgQyAxOCw0MC41IDI3LDQwLjUgMzIuNSwzNyBMIDMyLjUsMzAgQyAzMi41LDMwIDQxLjUsMjUuNSAzOC41LDE5LjUgQyAzNC41LDEzIDI1LDE2IDIyLjUsMjMuNSBMIDIyLjUsMjcgTCAyMi41LDIzLjUgQyAyMCwxNiAxMC41LDEzIDYuNSwxOS41IEMgMy41LDI1LjUgMTIuNSwzMCAxMi41LDMwIEwgMTIuNSwzNyIgc3R5bGU9ImZpbGw6IzAwMDAwMDsgc3Ryb2tlOiMwMDAwMDA7Ii8+CiAgICA8cGF0aCBkPSJNIDIwLDggTCAyNSw4IiBzdHlsZT0iZmlsbDpub25lOyBzdHJva2U6IzAwMDAwMDsgc3Ryb2tlLWxpbmVqb2luOm1pdGVyOyIvPgogICAgPHBhdGggZD0iTSAzMiwyOS41IEMgMzIsMjkuNSA0MC41LDI1LjUgMzguMDMsMTkuODUgQyAzNC4xNSwxNCAyNSwxOCAyMi41LDI0LjUgTCAyMi41LDI2LjYgTCAyMi41LDI0LjUgQyAyMCwxOCAxMC44NSwxNCA2Ljk3LDE5Ljg1IEMgNC41LDI1LjUgMTMsMjkuNSAxMywyOS41IiBzdHlsZT0iZmlsbDpub25lOyBzdHJva2U6I2ZmZmZmZjsiLz4KICAgIDxwYXRoIGQ9Ik0gMTIuNSwzMCBDIDE4LDI3IDI3LDI3IDMyLjUsMzAgTSAxMi41LDMzLjUgQyAxOCwzMC41IDI3LDMwLjUgMzIuNSwzMy41IE0gMTIuNSwzNyBDIDE4LDM0IDI3LDM0IDMyLjUsMzciIHN0eWxlPSJmaWxsOm5vbmU7IHN0cm9rZTojZmZmZmZmOyIvPgogIDwvZz4KPC9zdmc+Cg==",
    "bN": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+DQo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPg0KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1Ij4NCiAgPGcgc3R5bGU9Im9wYWNpdHk6MTsgZmlsbDpub25lOyBmaWxsLW9wYWNpdHk6MTsgZmlsbC1ydWxlOmV2ZW5vZGQ7IHN0cm9rZTojMDAwMDAwOyBzdHJva2Utd2lkdGg6MS41OyBzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbGluZWpvaW46cm91bmQ7c3Ryb2tlLW1pdGVybGltaXQ6NDsgc3Ryb2tlLWRhc2hhcnJheTpub25lOyBzdHJva2Utb3BhY2l0eToxOyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwwLjMpIj4NCiAgICA8cGF0aA0KICAgICAgZD0iTSAyMiwxMCBDIDMyLjUsMTEgMzguNSwxOCAzOCwzOSBMIDE1LDM5IEMgMTUsMzAgMjUsMzIuNSAyMywxOCINCiAgICAgIHN0eWxlPSJmaWxsOiMwMDAwMDA7IHN0cm9rZTojMDAwMDAwOyIgLz4NCiAgICA8cGF0aA0KICAgICAgZD0iTSAyNCwxOCBDIDI0LjM4LDIwLjkxIDE4LjQ1LDI1LjM3IDE2LDI3IEMgMTMsMjkgMTMuMTgsMzEuMzQgMTEsMzEgQyA5Ljk1OCwzMC4wNiAxMi40MSwyNy45NiAxMSwyOCBDIDEwLDI4IDExLjE5LDI5LjIzIDEwLDMwIEMgOSwzMCA1Ljk5NywzMSA2LDI2IEMgNiwyNCAxMiwxNCAxMiwxNCBDIDEyLDE0IDEzLjg5LDEyLjEgMTQsMTAuNSBDIDEzLjI3LDkuNTA2IDEzLjUsOC41IDEzLjUsNy41IEMgMTQuNSw2LjUgMTYuNSwxMCAxNi41LDEwIEwgMTguNSwxMCBDIDE4LjUsMTAgMTkuMjgsOC4wMDggMjEsNyBDIDIyLDcgMjIsMTAgMjIsMTAiDQogICAgICBzdHlsZT0iZmlsbDojMDAwMDAwOyBzdHJva2U6IzAwMDAwMDsiIC8+DQogICAgPHBhdGgNCiAgICAgIGQ9Ik0gOS41IDI1LjUgQSAwLjUgMC41IDAgMSAxIDguNSwyNS41IEEgMC41IDAuNSAwIDEgMSA5LjUgMjUuNSB6Ig0KICAgICAgc3R5bGU9ImZpbGw6I2ZmZmZmZjsgc3Ryb2tlOiNmZmZmZmY7IiAvPg0KICAgIDxwYXRoDQogICAgICBkPSJNIDE1IDE1LjUgQSAwLjUgMS41IDAgMSAxICAxNCwxNS41IEEgMC41IDEuNSAwIDEgMSAgMTUgMTUuNSB6Ig0KICAgICAgdHJhbnNmb3JtPSJtYXRyaXgoMC44NjYsMC41LC0wLjUsMC44NjYsOS42OTMsLTUuMTczKSINCiAgICAgIHN0eWxlPSJmaWxsOiNmZmZmZmY7IHN0cm9rZTojZmZmZmZmOyIgLz4NCiAgICA8cGF0aA0KICAgICAgZD0iTSAyNC41NSwxMC40IEwgMjQuMSwxMS44NSBMIDI0LjYsMTIgQyAyNy43NSwxMyAzMC4yNSwxNC40OSAzMi41LDE4Ljc1IEMgMzQuNzUsMjMuMDEgMzUuNzUsMjkuMDYgMzUuMjUsMzkgTCAzNS4yLDM5LjUgTCAzNy40NSwzOS41IEwgMzcuNSwzOSBDIDM4LDI4Ljk0IDM2LjYyLDIyLjE1IDM0LjI1LDE3LjY2IEMgMzEuODgsMTMuMTcgMjguNDYsMTEuMDIgMjUuMDYsMTAuNSBMIDI0LjU1LDEwLjQgeiAiDQogICAgICBzdHlsZT0iZmlsbDojZmZmZmZmOyBzdHJva2U6bm9uZTsiIC8+DQogIDwvZz4NCjwvc3ZnPg0K",
    "bP": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+CiAgPHBhdGggZD0ibSAyMi41LDkgYyAtMi4yMSwwIC00LDEuNzkgLTQsNCAwLDAuODkgMC4yOSwxLjcxIDAuNzgsMi4zOCBDIDE3LjMzLDE2LjUgMTYsMTguNTkgMTYsMjEgYyAwLDIuMDMgMC45NCwzLjg0IDIuNDEsNS4wMyBDIDE1LjQxLDI3LjA5IDExLDMxLjU4IDExLDM5LjUgSCAzNCBDIDM0LDMxLjU4IDI5LjU5LDI3LjA5IDI2LjU5LDI2LjAzIDI4LjA2LDI0Ljg0IDI5LDIzLjAzIDI5LDIxIDI5LDE4LjU5IDI3LjY3LDE2LjUgMjUuNzIsMTUuMzggMjYuMjEsMTQuNzEgMjYuNSwxMy44OSAyNi41LDEzIGMgMCwtMi4yMSAtMS43OSwtNCAtNCwtNCB6IiBzdHlsZT0ib3BhY2l0eToxOyBmaWxsOiMwMDAwMDA7IGZpbGwtb3BhY2l0eToxOyBmaWxsLXJ1bGU6bm9uemVybzsgc3Ryb2tlOiMwMDAwMDA7IHN0cm9rZS13aWR0aDoxLjU7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyBzdHJva2UtbGluZWpvaW46bWl0ZXI7IHN0cm9rZS1taXRlcmxpbWl0OjQ7IHN0cm9rZS1kYXNoYXJyYXk6bm9uZTsgc3Ryb2tlLW9wYWNpdHk6MTsiLz4KPC9zdmc+Cg==",
    "bQ": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIKImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI0NSIKaGVpZ2h0PSI0NSI+CiAgPGcgc3R5bGU9ImZpbGw6IzAwMDAwMDtzdHJva2U6IzAwMDAwMDtzdHJva2Utd2lkdGg6MS41OyBzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbGluZWpvaW46cm91bmQiPgoKICAgIDxwYXRoIGQ9Ik0gOSwyNiBDIDE3LjUsMjQuNSAzMCwyNC41IDM2LDI2IEwgMzguNSwxMy41IEwgMzEsMjUgTCAzMC43LDEwLjkgTCAyNS41LDI0LjUgTCAyMi41LDEwIEwgMTkuNSwyNC41IEwgMTQuMywxMC45IEwgMTQsMjUgTCA2LjUsMTMuNSBMIDksMjYgeiIKICAgIHN0eWxlPSJzdHJva2UtbGluZWNhcDpidXR0O2ZpbGw6IzAwMDAwMCIgLz4KICAgIDxwYXRoIGQ9Im0gOSwyNiBjIDAsMiAxLjUsMiAyLjUsNCAxLDEuNSAxLDEgMC41LDMuNSAtMS41LDEgLTEsMi41IC0xLDIuNSAtMS41LDEuNSAwLDIuNSAwLDIuNSA2LjUsMSAxNi41LDEgMjMsMCAwLDAgMS41LC0xIDAsLTIuNSAwLDAgMC41LC0xLjUgLTEsLTIuNSAtMC41LC0yLjUgLTAuNSwtMiAwLjUsLTMuNSAxLC0yIDIuNSwtMiAyLjUsLTQgLTguNSwtMS41IC0xOC41LC0xLjUgLTI3LDAgeiIgLz4KICAgIDxwYXRoIGQ9Ik0gMTEuNSwzMCBDIDE1LDI5IDMwLDI5IDMzLjUsMzAiIC8+CiAgICA8cGF0aCBkPSJtIDEyLDMzLjUgYyA2LC0xIDE1LC0xIDIxLDAiIC8+CiAgICA8Y2lyY2xlIGN4PSI2IiBjeT0iMTIiIHI9IjIiIC8+CiAgICA8Y2lyY2xlIGN4PSIxNCIgY3k9IjkiIHI9IjIiIC8+CiAgICA8Y2lyY2xlIGN4PSIyMi41IiBjeT0iOCIgcj0iMiIgLz4KICAgIDxjaXJjbGUgY3g9IjMxIiBjeT0iOSIgcj0iMiIgLz4KICAgIDxjaXJjbGUgY3g9IjM5IiBjeT0iMTIiIHI9IjIiIC8+CiAgICA8cGF0aCBkPSJNIDExLDM4LjUgQSAzNSwzNSAxIDAgMCAzNCwzOC41IgogICAgc3R5bGU9ImZpbGw6bm9uZTsgc3Ryb2tlOiMwMDAwMDA7c3Ryb2tlLWxpbmVjYXA6YnV0dDsiIC8+CiAgICA8ZyBzdHlsZT0iZmlsbDpub25lOyBzdHJva2U6I2ZmZmZmZjsiPgogICAgICA8cGF0aCBkPSJNIDExLDI5IEEgMzUsMzUgMSAwIDEgMzQsMjkiIC8+CiAgICAgIDxwYXRoIGQ9Ik0gMTIuNSwzMS41IEwgMzIuNSwzMS41IiAvPgogICAgICA8cGF0aCBkPSJNIDExLjUsMzQuNSBBIDM1LDM1IDEgMCAwIDMzLjUsMzQuNSIgLz4KICAgICAgPHBhdGggZD0iTSAxMC41LDM3LjUgQSAzNSwzNSAxIDAgMCAzNC41LDM3LjUiIC8+CiAgICA8L2c+CiAgPC9nPgo8L3N2Zz4K",
    "bR": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+CiAgPGcgc3R5bGU9Im9wYWNpdHk6MTsgZmlsbDojMDAwMDAwOyBmaWxsLW9wYWNpdHk6MTsgZmlsbC1ydWxlOmV2ZW5vZGQ7IHN0cm9rZTojMDAwMDAwOyBzdHJva2Utd2lkdGg6MS41OyBzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbGluZWpvaW46cm91bmQ7c3Ryb2tlLW1pdGVybGltaXQ6NDsgc3Ryb2tlLWRhc2hhcnJheTpub25lOyBzdHJva2Utb3BhY2l0eToxOyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwwLjMpIj4KICAgIDxwYXRoCiAgICAgIGQ9Ik0gOSwzOSBMIDM2LDM5IEwgMzYsMzYgTCA5LDM2IEwgOSwzOSB6ICIKICAgICAgc3R5bGU9InN0cm9rZS1saW5lY2FwOmJ1dHQ7IiAvPgogICAgPHBhdGgKICAgICAgZD0iTSAxMi41LDMyIEwgMTQsMjkuNSBMIDMxLDI5LjUgTCAzMi41LDMyIEwgMTIuNSwzMiB6ICIKICAgICAgc3R5bGU9InN0cm9rZS1saW5lY2FwOmJ1dHQ7IiAvPgogICAgPHBhdGgKICAgICAgZD0iTSAxMiwzNiBMIDEyLDMyIEwgMzMsMzIgTCAzMywzNiBMIDEyLDM2IHogIgogICAgICBzdHlsZT0ic3Ryb2tlLWxpbmVjYXA6YnV0dDsiIC8+CiAgICA8cGF0aAogICAgICBkPSJNIDE0LDI5LjUgTCAxNCwxNi41IEwgMzEsMTYuNSBMIDMxLDI5LjUgTCAxNCwyOS41IHogIgogICAgICBzdHlsZT0ic3Ryb2tlLWxpbmVjYXA6YnV0dDtzdHJva2UtbGluZWpvaW46bWl0ZXI7IiAvPgogICAgPHBhdGgKICAgICAgZD0iTSAxNCwxNi41IEwgMTEsMTQgTCAzNCwxNCBMIDMxLDE2LjUgTCAxNCwxNi41IHogIgogICAgICBzdHlsZT0ic3Ryb2tlLWxpbmVjYXA6YnV0dDsiIC8+CiAgICA8cGF0aAogICAgICBkPSJNIDExLDE0IEwgMTEsOSBMIDE1LDkgTCAxNSwxMSBMIDIwLDExIEwgMjAsOSBMIDI1LDkgTCAyNSwxMSBMIDMwLDExIEwgMzAsOSBMIDM0LDkgTCAzNCwxNCBMIDExLDE0IHogIgogICAgICBzdHlsZT0ic3Ryb2tlLWxpbmVjYXA6YnV0dDsiIC8+CiAgICA8cGF0aAogICAgICBkPSJNIDEyLDM1LjUgTCAzMywzNS41IEwgMzMsMzUuNSIKICAgICAgc3R5bGU9ImZpbGw6bm9uZTsgc3Ryb2tlOiNmZmZmZmY7IHN0cm9rZS13aWR0aDoxOyBzdHJva2UtbGluZWpvaW46bWl0ZXI7IiAvPgogICAgPHBhdGgKICAgICAgZD0iTSAxMywzMS41IEwgMzIsMzEuNSIKICAgICAgc3R5bGU9ImZpbGw6bm9uZTsgc3Ryb2tlOiNmZmZmZmY7IHN0cm9rZS13aWR0aDoxOyBzdHJva2UtbGluZWpvaW46bWl0ZXI7IiAvPgogICAgPHBhdGgKICAgICAgZD0iTSAxNCwyOS41IEwgMzEsMjkuNSIKICAgICAgc3R5bGU9ImZpbGw6bm9uZTsgc3Ryb2tlOiNmZmZmZmY7IHN0cm9rZS13aWR0aDoxOyBzdHJva2UtbGluZWpvaW46bWl0ZXI7IiAvPgogICAgPHBhdGgKICAgICAgZD0iTSAxNCwxNi41IEwgMzEsMTYuNSIKICAgICAgc3R5bGU9ImZpbGw6bm9uZTsgc3Ryb2tlOiNmZmZmZmY7IHN0cm9rZS13aWR0aDoxOyBzdHJva2UtbGluZWpvaW46bWl0ZXI7IiAvPgogICAgPHBhdGgKICAgICAgZD0iTSAxMSwxNCBMIDM0LDE0IgogICAgICBzdHlsZT0iZmlsbDpub25lOyBzdHJva2U6I2ZmZmZmZjsgc3Ryb2tlLXdpZHRoOjE7IHN0cm9rZS1saW5lam9pbjptaXRlcjsiIC8+CiAgPC9nPgo8L3N2Zz4K",
    "wB": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+DQo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPg0KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1Ij4NCiAgPGcgc3R5bGU9Im9wYWNpdHk6MTsgZmlsbDpub25lOyBmaWxsLXJ1bGU6ZXZlbm9kZDsgZmlsbC1vcGFjaXR5OjE7IHN0cm9rZTojMDAwMDAwOyBzdHJva2Utd2lkdGg6MS41OyBzdHJva2UtbGluZWNhcDpyb3VuZDsgc3Ryb2tlLWxpbmVqb2luOnJvdW5kOyBzdHJva2UtbWl0ZXJsaW1pdDo0OyBzdHJva2UtZGFzaGFycmF5Om5vbmU7IHN0cm9rZS1vcGFjaXR5OjE7IiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgwLDAuNikiPg0KICAgIDxnIHN0eWxlPSJmaWxsOiNmZmZmZmY7IHN0cm9rZTojMDAwMDAwOyBzdHJva2UtbGluZWNhcDpidXR0OyI+DQogICAgICA8cGF0aCBkPSJNIDksMzYgQyAxMi4zOSwzNS4wMyAxOS4xMSwzNi40MyAyMi41LDM0IEMgMjUuODksMzYuNDMgMzIuNjEsMzUuMDMgMzYsMzYgQyAzNiwzNiAzNy42NSwzNi41NCAzOSwzOCBDIDM4LjMyLDM4Ljk3IDM3LjM1LDM4Ljk5IDM2LDM4LjUgQyAzMi42MSwzNy41MyAyNS44OSwzOC45NiAyMi41LDM3LjUgQyAxOS4xMSwzOC45NiAxMi4zOSwzNy41MyA5LDM4LjUgQyA3LjY1LDM4Ljk5IDYuNjgsMzguOTcgNiwzOCBDIDcuMzUsMzYuNTQgOSwzNiA5LDM2IHoiLz4NCiAgICAgIDxwYXRoIGQ9Ik0gMTUsMzIgQyAxNy41LDM0LjUgMjcuNSwzNC41IDMwLDMyIEMgMzAuNSwzMC41IDMwLDMwIDMwLDMwIEMgMzAsMjcuNSAyNy41LDI2IDI3LjUsMjYgQyAzMywyNC41IDMzLjUsMTQuNSAyMi41LDEwLjUgQyAxMS41LDE0LjUgMTIsMjQuNSAxNy41LDI2IEMgMTcuNSwyNiAxNSwyNy41IDE1LDMwIEMgMTUsMzAgMTQuNSwzMC41IDE1LDMyIHoiLz4NCiAgICAgIDxwYXRoIGQ9Ik0gMjUgOCBBIDIuNSAyLjUgMCAxIDEgIDIwLDggQSAyLjUgMi41IDAgMSAxICAyNSA4IHoiLz4NCiAgICA8L2c+DQogICAgPHBhdGggZD0iTSAxNy41LDI2IEwgMjcuNSwyNiBNIDE1LDMwIEwgMzAsMzAgTSAyMi41LDE1LjUgTCAyMi41LDIwLjUgTSAyMCwxOCBMIDI1LDE4IiBzdHlsZT0iZmlsbDpub25lOyBzdHJva2U6IzAwMDAwMDsgc3Ryb2tlLWxpbmVqb2luOm1pdGVyOyIvPg0KICA8L2c+DQo8L3N2Zz4NCg==",
    "wK": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB3aWR0aD0iNDUiIGhlaWdodD0iNDUiPgogIDxnIGZpbGw9Im5vbmUiIGZpbGwtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlPSIjMDAwIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiIHN0cm9rZS13aWR0aD0iMS41Ij4KICAgIDxwYXRoIHN0cm9rZS1saW5lam9pbj0ibWl0ZXIiIGQ9Ik0yMi41IDExLjYzVjZNMjAgOGg1Ii8+CiAgICA8cGF0aCBmaWxsPSIjZmZmIiBzdHJva2UtbGluZWNhcD0iYnV0dCIgc3Ryb2tlLWxpbmVqb2luPSJtaXRlciIgZD0iTTIyLjUgMjVzNC41LTcuNSAzLTEwLjVjMCAwLTEtMi41LTMtMi41cy0zIDIuNS0zIDIuNWMtMS41IDMgMyAxMC41IDMgMTAuNSIvPgogICAgPHBhdGggZmlsbD0iI2ZmZiIgZD0iTTEyLjUgMzdjNS41IDMuNSAxNC41IDMuNSAyMCAwdi03czktNC41IDYtMTAuNWMtNC02LjUtMTMuNS0zLjUtMTYgNFYyN3YtMy41Yy0yLjUtNy41LTEyLTEwLjUtMTYtNC0zIDYgNiAxMC41IDYgMTAuNXY3Ii8+CiAgICA8cGF0aCBkPSJNMTIuNSAzMGM1LjUtMyAxNC41LTMgMjAgMG0tMjAgMy41YzUuNS0zIDE0LjUtMyAyMCAwbS0yMCAzLjVjNS41LTMgMTQuNS0zIDIwIDAiLz4KICA8L2c+Cjwvc3ZnPg==",
    "wN": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+DQo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPg0KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1Ij4NCiAgPGcgc3R5bGU9Im9wYWNpdHk6MTsgZmlsbDpub25lOyBmaWxsLW9wYWNpdHk6MTsgZmlsbC1ydWxlOmV2ZW5vZGQ7IHN0cm9rZTojMDAwMDAwOyBzdHJva2Utd2lkdGg6MS41OyBzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbGluZWpvaW46cm91bmQ7c3Ryb2tlLW1pdGVybGltaXQ6NDsgc3Ryb2tlLWRhc2hhcnJheTpub25lOyBzdHJva2Utb3BhY2l0eToxOyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwwLjMpIj4NCiAgICA8cGF0aA0KICAgICAgZD0iTSAyMiwxMCBDIDMyLjUsMTEgMzguNSwxOCAzOCwzOSBMIDE1LDM5IEMgMTUsMzAgMjUsMzIuNSAyMywxOCINCiAgICAgIHN0eWxlPSJmaWxsOiNmZmZmZmY7IHN0cm9rZTojMDAwMDAwOyIgLz4NCiAgICA8cGF0aA0KICAgICAgZD0iTSAyNCwxOCBDIDI0LjM4LDIwLjkxIDE4LjQ1LDI1LjM3IDE2LDI3IEMgMTMsMjkgMTMuMTgsMzEuMzQgMTEsMzEgQyA5Ljk1OCwzMC4wNiAxMi40MSwyNy45NiAxMSwyOCBDIDEwLDI4IDExLjE5LDI5LjIzIDEwLDMwIEMgOSwzMCA1Ljk5NywzMSA2LDI2IEMgNiwyNCAxMiwxNCAxMiwxNCBDIDEyLDE0IDEzLjg5LDEyLjEgMTQsMTAuNSBDIDEzLjI3LDkuNTA2IDEzLjUsOC41IDEzLjUsNy41IEMgMTQuNSw2LjUgMTYuNSwxMCAxNi41LDEwIEwgMTguNSwxMCBDIDE4LjUsMTAgMTkuMjgsOC4wMDggMjEsNyBDIDIyLDcgMjIsMTAgMjIsMTAiDQogICAgICBzdHlsZT0iZmlsbDojZmZmZmZmOyBzdHJva2U6IzAwMDAwMDsiIC8+DQogICAgPHBhdGgNCiAgICAgIGQ9Ik0gOS41IDI1LjUgQSAwLjUgMC41IDAgMSAxIDguNSwyNS41IEEgMC41IDAuNSAwIDEgMSA5LjUgMjUuNSB6Ig0KICAgICAgc3R5bGU9ImZpbGw6IzAwMDAwMDsgc3Ryb2tlOiMwMDAwMDA7IiAvPg0KICAgIDxwYXRoDQogICAgICBkPSJNIDE1IDE1LjUgQSAwLjUgMS41IDAgMSAxICAxNCwxNS41IEEgMC41IDEuNSAwIDEgMSAgMTUgMTUuNSB6Ig0KICAgICAgdHJhbnNmb3JtPSJtYXRyaXgoMC44NjYsMC41LC0wLjUsMC44NjYsOS42OTMsLTUuMTczKSINCiAgICAgIHN0eWxlPSJmaWxsOiMwMDAwMDA7IHN0cm9rZTojMDAwMDAwOyIgLz4NCiAgPC9nPg0KPC9zdmc+DQo=",
    "wP": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+CiAgPHBhdGggZD0ibSAyMi41LDkgYyAtMi4yMSwwIC00LDEuNzkgLTQsNCAwLDAuODkgMC4yOSwxLjcxIDAuNzgsMi4zOCBDIDE3LjMzLDE2LjUgMTYsMTguNTkgMTYsMjEgYyAwLDIuMDMgMC45NCwzLjg0IDIuNDEsNS4wMyBDIDE1LjQxLDI3LjA5IDExLDMxLjU4IDExLDM5LjUgSCAzNCBDIDM0LDMxLjU4IDI5LjU5LDI3LjA5IDI2LjU5LDI2LjAzIDI4LjA2LDI0Ljg0IDI5LDIzLjAzIDI5LDIxIDI5LDE4LjU5IDI3LjY3LDE2LjUgMjUuNzIsMTUuMzggMjYuMjEsMTQuNzEgMjYuNSwxMy44OSAyNi41LDEzIGMgMCwtMi4yMSAtMS43OSwtNCAtNCwtNCB6IiBzdHlsZT0ib3BhY2l0eToxOyBmaWxsOiNmZmZmZmY7IGZpbGwtb3BhY2l0eToxOyBmaWxsLXJ1bGU6bm9uemVybzsgc3Ryb2tlOiMwMDAwMDA7IHN0cm9rZS13aWR0aDoxLjU7IHN0cm9rZS1saW5lY2FwOnJvdW5kOyBzdHJva2UtbGluZWpvaW46bWl0ZXI7IHN0cm9rZS1taXRlcmxpbWl0OjQ7IHN0cm9rZS1kYXNoYXJyYXk6bm9uZTsgc3Ryb2tlLW9wYWNpdHk6MTsiLz4KPC9zdmc+Cg==",
    "wQ": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+CjwhRE9DVFlQRSBzdmcgUFVCTElDICItLy9XM0MvL0RURCBTVkcgMS4xLy9FTiIgImh0dHA6Ly93d3cudzMub3JnL0dyYXBoaWNzL1NWRy8xLjEvRFREL3N2ZzExLmR0ZCI+CjxzdmcgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHdpZHRoPSI0NSIgaGVpZ2h0PSI0NSI+CiAgPGcgc3R5bGU9ImZpbGw6I2ZmZmZmZjtzdHJva2U6IzAwMDAwMDtzdHJva2Utd2lkdGg6MS41O3N0cm9rZS1saW5lam9pbjpyb3VuZCI+CiAgICA8cGF0aCBkPSJNIDksMjYgQyAxNy41LDI0LjUgMzAsMjQuNSAzNiwyNiBMIDM4LjUsMTMuNSBMIDMxLDI1IEwgMzAuNywxMC45IEwgMjUuNSwyNC41IEwgMjIuNSwxMCBMIDE5LjUsMjQuNSBMIDE0LjMsMTAuOSBMIDE0LDI1IEwgNi41LDEzLjUgTCA5LDI2IHoiLz4KICAgIDxwYXRoIGQ9Ik0gOSwyNiBDIDksMjggMTAuNSwyOCAxMS41LDMwIEMgMTIuNSwzMS41IDEyLjUsMzEgMTIsMzMuNSBDIDEwLjUsMzQuNSAxMSwzNiAxMSwzNiBDIDkuNSwzNy41IDExLDM4LjUgMTEsMzguNSBDIDE3LjUsMzkuNSAyNy41LDM5LjUgMzQsMzguNSBDIDM0LDM4LjUgMzUuNSwzNy41IDM0LDM2IEMgMzQsMzYgMzQuNSwzNC41IDMzLDMzLjUgQyAzMi41LDMxIDMyLjUsMzEuNSAzMy41LDMwIEMgMzQuNSwyOCAzNiwyOCAzNiwyNiBDIDI3LjUsMjQuNSAxNy41LDI0LjUgOSwyNiB6Ii8+CiAgICA8cGF0aCBkPSJNIDExLjUsMzAgQyAxNSwyOSAzMCwyOSAzMy41LDMwIiBzdHlsZT0iZmlsbDpub25lIi8+CiAgICA8cGF0aCBkPSJNIDEyLDMzLjUgQyAxOCwzMi41IDI3LDMyLjUgMzMsMzMuNSIgc3R5bGU9ImZpbGw6bm9uZSIvPgogICAgPGNpcmNsZSBjeD0iNiIgY3k9IjEyIiByPSIyIiAvPgogICAgPGNpcmNsZSBjeD0iMTQiIGN5PSI5IiByPSIyIiAvPgogICAgPGNpcmNsZSBjeD0iMjIuNSIgY3k9IjgiIHI9IjIiIC8+CiAgICA8Y2lyY2xlIGN4PSIzMSIgY3k9IjkiIHI9IjIiIC8+CiAgICA8Y2lyY2xlIGN4PSIzOSIgY3k9IjEyIiByPSIyIiAvPgogIDwvZz4KPC9zdmc+Cg==",
    "wR": "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiIHN0YW5kYWxvbmU9Im5vIj8+DQo8IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPg0KPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZlcnNpb249IjEuMSIgd2lkdGg9IjQ1IiBoZWlnaHQ9IjQ1Ij4NCiAgPGcgc3R5bGU9Im9wYWNpdHk6MTsgZmlsbDojZmZmZmZmOyBmaWxsLW9wYWNpdHk6MTsgZmlsbC1ydWxlOmV2ZW5vZGQ7IHN0cm9rZTojMDAwMDAwOyBzdHJva2Utd2lkdGg6MS41OyBzdHJva2UtbGluZWNhcDpyb3VuZDtzdHJva2UtbGluZWpvaW46cm91bmQ7c3Ryb2tlLW1pdGVybGltaXQ6NDsgc3Ryb2tlLWRhc2hhcnJheTpub25lOyBzdHJva2Utb3BhY2l0eToxOyIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoMCwwLjMpIj4NCiAgICA8cGF0aA0KICAgICAgZD0iTSA5LDM5IEwgMzYsMzkgTCAzNiwzNiBMIDksMzYgTCA5LDM5IHogIg0KICAgICAgc3R5bGU9InN0cm9rZS1saW5lY2FwOmJ1dHQ7IiAvPg0KICAgIDxwYXRoDQogICAgICBkPSJNIDEyLDM2IEwgMTIsMzIgTCAzMywzMiBMIDMzLDM2IEwgMTIsMzYgeiAiDQogICAgICBzdHlsZT0ic3Ryb2tlLWxpbmVjYXA6YnV0dDsiIC8+DQogICAgPHBhdGgNCiAgICAgIGQ9Ik0gMTEsMTQgTCAxMSw5IEwgMTUsOSBMIDE1LDExIEwgMjAsMTEgTCAyMCw5IEwgMjUsOSBMIDI1LDExIEwgMzAsMTEgTCAzMCw5IEwgMzQsOSBMIDM0LDE0Ig0KICAgICAgc3R5bGU9InN0cm9rZS1saW5lY2FwOmJ1dHQ7IiAvPg0KICAgIDxwYXRoDQogICAgICBkPSJNIDM0LDE0IEwgMzEsMTcgTCAxNCwxNyBMIDExLDE0IiAvPg0KICAgIDxwYXRoDQogICAgICBkPSJNIDMxLDE3IEwgMzEsMjkuNSBMIDE0LDI5LjUgTCAxNCwxNyINCiAgICAgIHN0eWxlPSJzdHJva2UtbGluZWNhcDpidXR0OyBzdHJva2UtbGluZWpvaW46bWl0ZXI7IiAvPg0KICAgIDxwYXRoDQogICAgICBkPSJNIDMxLDI5LjUgTCAzMi41LDMyIEwgMTIuNSwzMiBMIDE0LDI5LjUiIC8+DQogICAgPHBhdGgNCiAgICAgIGQ9Ik0gMTEsMTQgTCAzNCwxNCINCiAgICAgIHN0eWxlPSJmaWxsOm5vbmU7IHN0cm9rZTojMDAwMDAwOyBzdHJva2UtbGluZWpvaW46bWl0ZXI7IiAvPg0KICA8L2c+DQo8L3N2Zz4NCg=="
};

function openGUI() {
    Gui.open(() => {
        const popDoc = Gui.document;
        const popHead = popDoc.head;
        const popWin = Gui.window;
        const q = id => popDoc.querySelector(id);

        // Scripts are now loaded via @require in the userscript header to completely bypass CSP!

        const fenEl = q('#fen');
        const orientationEl = q('#orientation');

        if (!fenEl) {
            q('#chessboard-card')?.remove();
            q('#orientation')?.remove();
            return;
        }

        const waitForLibraries = (attempts = 0) => {
            const maxAttempts = 50;
            const delay = attempts < 10 ? 50 : 100;
            if (attempts >= maxAttempts) {
                console.warn('UserGui: jQuery or ChessBoard failed to load after multiple attempts');
                q('#chessboard-card')?.remove();
                q('#orientation')?.remove();
                return;
            }
            if (window.jQuery && (window.Chessboard || window.ChessBoard)) {
                initializeChessboard();
            } else {
                setTimeout(() => waitForLibraries(attempts + 1), delay);
            }
        };

        const initializeChessboard = () => {
            if (!q('#board')) {
                console.warn('UserGui: #board element not found');
                return;
            }

            const cb = window.Chessboard || window.ChessBoard;
            let uiBoard = cb(q('#board'), {
                pieceTheme: piece => PIECES_B64[piece],
                position: 'start',
                orientation: playerColor === 'b' ? 'black' : 'white'
            });

            if (!uiBoard) {
                console.error('UserGui: ChessBoard initialization returned null/undefined');
                q('#chessboard-card')?.remove();
                return;
            }

            console.log('UserGui: ChessBoard successfully initialized');

            new MutationObserver(() => {
                try {
                    uiBoard = cb(q('#board'), {
                        pieceTheme: piece => PIECES_B64[piece],
                        position: fenEl.textContent || 'start',
                        orientation: orientationEl.textContent === 'b' ? 'black' : 'white'
                    });
                } catch (e) {
                    console.error('UserGui: Error reinitializing board on orientation change:', e);
                }
            }).observe(orientationEl, { childList: true, characterData: true, subtree: true });

            new MutationObserver(() => {
                try {
                    const newFen = fenEl.textContent;
                    if (newFen && uiBoard) uiBoard.position(newFen);
                } catch (e) {
                    console.error('UserGui: Error updating board position:', e);
                }
            }).observe(fenEl, { childList: true, characterData: true, subtree: true });
        };

        waitForLibraries();

        const depthRangeEl = q('#depth-range');
        const depthRangeNumEl = q('#depth-range-number');
        const moveTimeRangeEl = q('#movetime-range');
        const moveTimeRangeNumEl = q('#movetime-range-number');
        const maxMovesEl = q('#max-moves');
        const maxMovesDivEl = q('#max-moves-div');
        const engineModeEl = q('#select-engine-mode');
        const engineEl = q('#select-engine');
        const engineNameDivEl = q('#node-engine-div');
        const reloadEngineDivEl = q('#reload-engine-div');
        const reloadEngineEl = q('#reload-engine');
        const reloadEveryDivEl = q('#reload-count-div');
        const reloadEveryEl = q('#reload-count');
        const nodeNameEl = q('#engine-name');
        const nodeUrlEl = q('#engine-url');
        const useBookEl = q('#use-book-moves');
        const showOppEl = q('#show-opposite-moves');
        const displayOnSiteEl = q('#display-moves-on-site');
        const enableUserLogEl = q('#enable-user-log');
        const enableEngineLogEl = q('#enable-engine-log');
        const eloEl = q('#elo');
        const bestMoveBtnEl = q('#bestmove-btn');
        const autoplayCheckboxEl = q('#autoplay-checkbox');
        const nightModeEl = q('#night-mode-btn');
        const tutoEl = q('#tuto-btn');
        const resetEl = q('#reset-settings');
        const cooldownSlider = q('#cooldown-slider');
        const cooldownValue = q('#cooldown-value');
        const bezierBypassCheckbox = q('#bezier-bypass');

        fixDepthMoveTimeInput(depthRangeEl, depthRangeNumEl, moveTimeRangeEl, moveTimeRangeNumEl, eloEl);
        const selectedEngine = ENGINE_NAMES.indexOf(engineName);
        if (engineEl) engineEl.selectedIndex = selectedEngine >= 0 ? selectedEngine : 0;
        if (engineModeEl) engineModeEl.selectedIndex = engineMode;
        if (cooldownSlider) cooldownSlider.value = move_cooldown;
        if (cooldownValue) cooldownValue.textContent = move_cooldown + 'ms';
        if (bezierBypassCheckbox) bezierBypassCheckbox.checked = use_bezier_bypass;
        applyNightMode();

        if (isFirefox()) {
            popDoc.querySelectorAll('.rendered-form').forEach(el => el.style.width = 'auto');
            const gui = q('#gui');
            const content = q('#content');
            if (gui) gui.style.minWidth = '350px';
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

        if (CURRENT_SITE === LICHESS_ORG) {
            if (maxMovesDivEl) maxMovesDivEl.style.display = 'none';
            if (engineNameDivEl) engineNameDivEl.style.display = 'none';
            if (reloadEngineDivEl) reloadEngineDivEl.style.display = 'block';
        }

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

            if (engine && engineName === 'Stockfish 18 ASM') {
                Interface.log('Manually cancelling current engine search...');
                engine.terminate();
                loadChessEngine(true, () => {
                    bestMoveBtnEl.disabled = true;
                    forcedBestMove = true;
                    updateBoard(false);
                    sendBestMove();
                    setTimeout(() => resetBestMoveBtn(), 5000);
                });
                return;
            }

            bestMoveBtnEl.disabled = true;
            forcedBestMove = true;
            updateBoard(false);
            sendBestMove();
            setTimeout(() => resetBestMoveBtn(), 5000);
        };

        if (autoplayCheckboxEl) {
            autoplayCheckboxEl.onchange = () => {
                isAutoplay = autoplayCheckboxEl.checked;
                GM_setValue(DB.isAutoplay, isAutoplay);
                if (isAutoplay && isPlayerTurn && CURRENT_SITE === CHESS_COM) {
                    bestMoveBtnEl.click();
                }
            };
        }

        if (engineModeEl) engineModeEl.onchange = () => {
            engineMode = engineModeEl.selectedIndex;
            GM_setValue(DB.engineMode, engineMode);
            fixDepthMoveTimeInput(depthRangeEl, depthRangeNumEl, moveTimeRangeEl, moveTimeRangeNumEl, eloEl);
            // Cancel any in flight request with old mode
            lastBestMoveID++;
            Interface.log(`Engine mode: ${engineMode === DEPTH_MODE ? 'Depth' : 'Move time'}`);
        };

        if (engineEl) engineEl.onchange = () => {
            engineName = engineEl.value;
            GM_setValue(DB.engineName, engineName);
            const isNode = engineName === GO_ENGINE_NAME;
            if (reloadEngineDivEl) reloadEngineDivEl.style.display = isNode ? 'none' : 'block';
            if (engineNameDivEl) engineNameDivEl.style.display = isNode ? 'block' : 'none';
            if (maxMovesDivEl) maxMovesDivEl.style.display = isNode ? 'none' : 'block';
            if (engineObjectURL) {
                URL.revokeObjectURL(engineObjectURL);
                engineObjectURL = null;
                loadedEngineName = null;
            }
            engine?.terminate();
            engine = null;
            loadedEngineName = null;
            // Cancel in-flight requests.
            lastBestMoveID++;
            loadChessEngine(true, () => {
                Interface.boardUtils.removeBestMarkings();
                removeSiteMoveMarkings();
                Interface.boardUtils.updateBoardPower(0, 0);
                Interface.log(`Engine switched to: ${engineName}`);
            });
        };

        const changePower = val => {
            if (engineMode === DEPTH_MODE) {
                current_depth = Number(val);
                GM_setValue(DB.current_depth, current_depth);
                if (depthRangeEl) depthRangeEl.value = current_depth;
                if (depthRangeNumEl) depthRangeNumEl.value = current_depth;
            } else {
                current_movetime = Number(val);
                GM_setValue(DB.current_movetime, current_movetime);
                if (moveTimeRangeEl) moveTimeRangeEl.value = current_movetime;
                if (moveTimeRangeNumEl) moveTimeRangeNumEl.value = current_movetime;
            }
            setEloDescription(eloEl);
            // Force engine to use new (depth, movetime) on next request immediately
            // Cancel any in flight request.
            lastBestMoveID++;
        };

        if (depthRangeEl) depthRangeEl.onchange = () => changePower(depthRangeEl.value);
        if (depthRangeNumEl) depthRangeNumEl.onchange = () => changePower(depthRangeNumEl.value);
        if (moveTimeRangeEl) moveTimeRangeEl.onchange = () => changePower(moveTimeRangeEl.value);
        if (moveTimeRangeNumEl) moveTimeRangeNumEl.onchange = () => changePower(moveTimeRangeNumEl.value);
        if (maxMovesEl) maxMovesEl.onchange = () => { max_best_moves = Number(maxMovesEl.value); GM_setValue(DB.max_best_moves, max_best_moves); };

        if (nodeNameEl) nodeNameEl.onchange = () => { node_engine_name = nodeNameEl.value; GM_setValue(DB.node_engine_name, node_engine_name); };
        if (nodeUrlEl) nodeUrlEl.onchange = () => { node_engine_url = nodeUrlEl.value; GM_setValue(DB.node_engine_url, node_engine_url); };
        if (useBookEl) useBookEl.onchange = () => { use_book_moves = useBookEl.checked; GM_setValue(DB.use_book_moves, use_book_moves); };
        if (showOppEl) showOppEl.onchange = () => { show_opposite_moves = showOppEl.checked; GM_setValue(DB.show_opposite_moves, show_opposite_moves); };
        if (displayOnSiteEl) displayOnSiteEl.onchange = () => { displayMovesOnSite = displayOnSiteEl.checked; GM_setValue(DB.displayMovesOnSite, displayMovesOnSite); };
        if (enableUserLogEl) enableUserLogEl.onchange = () => { enableUserLog = enableUserLogEl.checked; GM_setValue(DB.enableUserLog, enableUserLog); };
        if (enableEngineLogEl) enableEngineLogEl.onchange = () => { enableEngineLog = enableEngineLogEl.checked; GM_setValue(DB.enableEngineLog, enableEngineLog); };
        if (reloadEngineEl) reloadEngineEl.onchange = () => {
            reload_engine = reloadEngineEl.checked;
            if (reloadEveryDivEl) reloadEveryDivEl.style.display = reload_engine ? 'block' : 'none';
            GM_setValue(DB.reload_engine, reload_engine);
        };

        if (cooldownSlider) {
            cooldownSlider.oninput = () => {
                move_cooldown = parseInt(cooldownSlider.value);
                cooldownValue.textContent = move_cooldown + 'ms';
                GM_setValue(DB.move_cooldown, move_cooldown);
                Interface.log(`Move cooldown set to: ${move_cooldown}ms`);
            };
        }

        if (bezierBypassCheckbox) {
            bezierBypassCheckbox.onchange = () => {
                use_bezier_bypass = bezierBypassCheckbox.checked;
                GM_setValue(DB.use_bezier_bypass, use_bezier_bypass);
                Interface.log(`Bezier bypass: ${use_bezier_bypass ? 'ENABLED' : 'disabled'}`);
            };
        }

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
    depthR.style.display = (!ff && dm) ? 'block' : 'none';
    depthN.style.display = (ff && dm) ? 'block' : 'none';
    mtR.style.display = (!ff && !dm) ? 'block' : 'none';
    mtN.style.display = (ff && !dm) ? 'block' : 'none';
    setEloDescription(eloElem);
}

// Database
async function initializeDatabase(callback) {
    const defaults = {
        nightMode: false, engineMode: 0, engineName: ENGINE_NAMES[0],
        reload_engine: false, reload_every: 10,
        enableUserLog: true, enableEngineLog: true,
        displayMovesOnSite: false, show_opposite_moves: false, use_book_moves: false,
        node_engine_url: 'http://localhost:5000', node_engine_name: 'komodo-201-64',
        current_depth: Math.round(MAX_DEPTH / 2), current_movetime: Math.round(MAX_MOVETIME / 3),
        max_best_moves: 1, isAutoplay: false, move_cooldown: DEFAULT_COOLDOWN, use_bezier_bypass: DEFAULT_BYPASS
    };

    const stored = await GM_getValue(DB.nightMode);

    if (stored === undefined) {
        for (const [k, v] of Object.entries(defaults)) await GM_setValue(DB[k], v);
    }

    nightMode = await GM_getValue(DB.nightMode);
    engineMode = await GM_getValue(DB.engineMode);
    engineName = await GM_getValue(DB.engineName) || ENGINE_NAMES[0];
    reload_engine = await GM_getValue(DB.reload_engine);
    reload_every = await GM_getValue(DB.reload_every);
    enableUserLog = await GM_getValue(DB.enableUserLog);
    enableEngineLog = await GM_getValue(DB.enableEngineLog);
    displayMovesOnSite = await GM_getValue(DB.displayMovesOnSite);
    show_opposite_moves = await GM_getValue(DB.show_opposite_moves);
    use_book_moves = await GM_getValue(DB.use_book_moves);
    node_engine_url = await GM_getValue(DB.node_engine_url) || 'http://localhost:5000';
    node_engine_name = await GM_getValue(DB.node_engine_name) || 'komodo-201-64';
    current_depth = await GM_getValue(DB.current_depth);
    current_movetime = await GM_getValue(DB.current_movetime);
    max_best_moves = await GM_getValue(DB.max_best_moves);
    isAutoplay = await GM_getValue(DB.isAutoplay);
    move_cooldown = await GM_getValue(DB.move_cooldown, DEFAULT_COOLDOWN);
    use_bezier_bypass = await GM_getValue(DB.use_bezier_bypass, DEFAULT_BYPASS);

    callback();
}

// Entry point
function initialize() {
    const style = document.createElement('style');
    style.innerHTML = `
        .custom.highlight { pointer-events: none !important; }
        cg-container svg, cg-board svg, .cg-shapes, .cg-custom-svgs { pointer-events: none !important; }
    `;
    document.head.appendChild(style);

    Interface = new InterfaceUtils();
    const logger = (...args) => console.log('[SmartChess]', ...args);
    if (!Interface.log) Interface.log = logger;
    if (!Interface.log) Interface.log = (...args) => console.log('[SmartChess]', ...args);
    const LozzaUtils = new LozzaUtility();
    window._LozzaUtils = LozzaUtils;
    turn = Interface.getBoardOrientation();

    initializeDatabase(() =>
        loadChessEngine(false, () =>
            updatePlayerColor(() => {
                addGuiPages();
                openGUI();
            })
        )
    );
}

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
        if (window.location.href.includes('lichess.org')) CURRENT_SITE = LICHESS_ORG;
        else if (window.location.href.includes('chess.com')) CURRENT_SITE = CHESS_COM;
    }

    if (CURRENT_SITE === LICHESS_ORG) {
        boardElem = document.querySelector('cg-board') || document.querySelector('.cg-wrap') || document.querySelector('[data-board]');
        firstPieceElem = boardElem?.querySelector('piece:not(.ghost)') ?? boardElem?.querySelector('.cg-piece') ?? boardElem?.querySelector('[data-role]') ?? null;
    } else if (CURRENT_SITE === CHESS_COM) {
        firstPieceElem = document.querySelector('.piece');
        boardElem = firstPieceElem ? (firstPieceElem.closest('wc-chess-board') || firstPieceElem.closest('.board')) : document.querySelector('wc-chess-board, .board');
    }

    if (boardElem && firstPieceElem && chessBoardElem !== boardElem) {
        chessBoardElem = boardElem;
        clearInterval(waitForChessBoard);
        initialize();
    }
}, 1000);