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

const repositoryRawURL  = 'https://raw.githubusercontent.com/libalpm64/Linux-Smart-Chess-Bot/refs/heads/main';
const engineBase = `${repositoryRawURL}/engines`;
const LICHESS_API       = 'https://lichess.org/api/cloud-eval';
const CHESS_COM         = 0;
const LICHESS_ORG       = 1;
const TURN_UPDATE_FIX   = true;

const MAX_DEPTH         = 20;
const MIN_DEPTH         = 1;
const MAX_MOVETIME      = 2000;
const MIN_MOVETIME      = 50;
const MAX_ELO           = 3500;
const DEPTH_MODE        = 0;
const MAX_LOGS          = 50;

const rank = ['Beginner', 'Intermediate', 'Advanced', 'Expert', 'Master', 'Grand Master'];

const ENGINE_RESOURCES  = ['lozza.js', 'stockfish-5.js', 'stockfish-2018.js', 'tomitankChess.js', 'stockfish-18-asm.js'];
const ENGINE_NAMES      = ['Lozza', 'Stockfish 5', 'Stockfish 2018', 'TomitankChess', 'Stockfish 18 ASM', 'go_server'];
const GO_ENGINE_NAME = ENGINE_NAMES[ENGINE_NAMES.length - 1];
const JS_ENGINE_COUNT = ENGINE_NAMES.length - 1;

const best_move_color                = [0,   0,   250, 0.5];
const opposite_best_move_color       = [250, 0,   0,   0.5];
const possible_moves_colors          = [[200,180,0,0.9],[150,180,0,0.9],[100,180,0,0.9],[50,180,0,0.9]];
const opposite_possible_moves_colors = [[250,200,200,0.9],[250,150,150,0.9],[250,100,100,0.9],[250,50,50,0.9]];
const defaultFromSquareStyle = 'border:4px solid rgb(0 0 0/50%);';
const defaultToSquareStyle   = 'border:4px dashed rgb(0 0 0/50%);';

const DB = {
    nightMode:'nightMode', engineMode:'engineMode', engineName:'engineName',
    reload_every:'reload_every', reload_engine:'reload_engine',
    enableUserLog:'enableUserLog', enableEngineLog:'enableEngineLog',
    displayMovesOnSite:'displayMovesOnSite', show_opposite_moves:'show_opposite_moves',
    use_book_moves:'use_book_moves', node_engine_url:'node_engine_url',
    node_engine_name:'node_engine_name', current_depth:'current_depth',
    current_movetime:'current_movetime', max_best_moves:'max_best_moves'
};

let nightMode           = false;
let engineMode          = 0;
let engineName         = ENGINE_NAMES[0];
let reload_every        = 10;
let reload_engine       = false;
let enableUserLog       = true;
let enableEngineLog     = true;
let displayMovesOnSite  = false;
let show_opposite_moves = false;
let use_book_moves      = false;
let node_engine_url     = 'http://localhost:5000';
let node_engine_name    = 'komodo-201-64';
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
let loadedEngineName  = null;

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

const Gui = new UserGui();
Gui.settings.window.title    = 'Smart Chess Bot';
Gui.settings.window.external = true;
Gui.settings.window.size     = { width: 500, height: 620 };
Gui.settings.gui.external    = { popup: true, style: '' };

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

const isFirefox         = () => navigator.userAgent.toLowerCase().includes('firefox');
const alphabetPosition  = ch => ch.charCodeAt(0) - 97;
const removeDuplicates  = arr => [...new Set(arr)];
const sleep             = ms => new Promise(r => setTimeout(r, ms));

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

    // Puzzles (.tview2 move elements), Do not count indexs.
    const puzzleMoves = document.querySelectorAll('.tview2 move');
    if (puzzleMoves.length > 0) return puzzleMoves.length % 2 === 0 ? 'w' : 'b';

    // Fallback (If all fails)
    const otherMoves = document.querySelectorAll('.puzzle__moves move, .move-list move');
    if (otherMoves.length > 0) return otherMoves.length % 2 === 0 ? 'w' : 'b';

    return null;
}

function FenUtils() {
    this.getPieceOppositeColor = s => (s === s.toUpperCase() ? 'b' : 'w');

    this.getFenCodeFromPieceElem = elem => {
        if (CURRENT_SITE === CHESS_COM)   return this.getChessComPieceFen(elem);
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
        if (CURRENT_SITE === CHESS_COM) return document.querySelector('.board.flipped') ? 'b' : 'w';
        if (CURRENT_SITE === LICHESS_ORG) {
            const cgWrap = document.querySelector('.cg-wrap');
            // orientation-black means the board is flipped = you are playing black
            // orientation-white means the board is normal = you are playing white
            return cgWrap?.classList.contains('orientation-black') ? 'b' : 'w';
        }
        return 'w';
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
            if (CURRENT_SITE === CHESS_COM && !isFirefox()) {
                [from, to].forEach((sq, i) => {
                    const el = this.boardUtils.findSquareElem(sq);
                    if (!el) return;
                    el.style.scale = i === 0 ? '0.8' : '0.9';
                    el.style.backgroundColor = `rgb(${color[0]},${color[1]},${color[2]})`;
                    activeGuiMoveHighlights.push(el);
                });
            }
            if (displayMovesOnSite && isPlayerTurn)
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

let _lichessSvgLayer   = null;
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
        position:      'absolute',
        top:           '0',
        left:          '0',
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
        // Z-Index is high because it will opaque out Lichess's DOM element override
        zIndex:        '100',
        overflow:      'visible',
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
    defs.appendChild(makeMarker('scb-head-blue',   'rgba(0,0,250,0.9)'));
    defs.appendChild(makeMarker('scb-head-red',    'rgba(250,0,0,0.9)'));
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
    const wrap    = document.querySelector('.cg-wrap');
    const isBlack = wrap?.classList.contains('orientation-black');
    const files   = { a:0, b:1, c:2, d:3, e:4, f:5, g:6, h:7 };
    let x = files[notation[0]];
    let y = 8 - parseInt(notation[1]);
    if (isBlack) { x = 7 - x; y = 7 - y; }
    return (x === undefined || isNaN(y)) ? null : { x, y };
}

function _pickSvgMarker(rgba) {
    if (rgba[2] > rgba[0]) return 'scb-head-blue';
    if (rgba[0] >= 250)    return 'scb-head-red';
    if (rgba[0] >= 200)    return 'scb-head-yellow';
    return 'scb-head-orange';
}

function _drawLichessArrow(svg, fromSq, toSq, rgba, lineIndex) {
    const s = _sqToSvgCoords(fromSq);
    const e = _sqToSvgCoords(toSq);
    if (!s || !e) return;

    const strokeColor = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3] ?? 0.85})`;
    const fillColor   = `rgba(${rgba[0]},${rgba[1]},${rgba[2]},0.15)`;

    const box = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    box.setAttribute('x',            s.x + 0.05);
    box.setAttribute('y',            s.y + 0.05);
    box.setAttribute('width',        '0.9');
    box.setAttribute('height',       '0.9');
    box.setAttribute('fill',         fillColor);
    box.setAttribute('stroke',       strokeColor);
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
    path.setAttribute('d',            d);
    path.setAttribute('fill',         'none');
    path.setAttribute('stroke',       strokeColor);
    path.setAttribute('stroke-width', lineIndex === 0 ? '0.13' : '0.09');
    path.setAttribute('marker-end',   `url(#${_pickSvgMarker(rgba)})`);
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
            activeSiteMoveHighlights.push(el);
            chessBoardElem.prepend(el);
        };
        highlight(fromSq, defaultFromSquareStyle);
        highlight(toSq,   defaultToSquareStyle);
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
    const feedback = document.querySelector('.puzzle__feedback');
    if (feedback && feedback.classList.contains('fail')) {
        Interface.log('Puzzle Failed. Stopping analysis.');
        clearBoard();
        return;
    }

    const fenUtil    = new FenUtils();
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

    possible_moves = [];
    lastBestMoveID++;
    const req = { id: lastBestMoveID, fen: currentFen };

    reloadChessEngine(false, () => {
        Interface.log(`Your turn (${playerColor}). Sending best-move request…`);
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
            moveResult(move.slice(0,2), move.slice(2,4), current_depth, true);
        },
        onerror: () => { if (lastBestMoveID === request.id) getBestMoves(request); }
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
                Interface.log('Server error: ' + res.status);
                return;
            }
            if (!res.response || res.response === 'false') {
                resetBestMoveBtn();
                Interface.log('Server returned empty');
                return;
            }
            const data = safeParseJSON(res.response);
            if (!data) {
                resetBestMoveBtn();
                Interface.log('Invalid JSON: ' + (res.response || '').slice(0, 50));
                return;
            }
            console.log('Parsed data:', data);
            const { depth, movetime, move } = data;
            console.log('Server response:', data);
            if (!move || move.length < 4) {
                resetBestMoveBtn();
                Interface.log('Server returned invalid move.');
                return;
            }
            if (move === 'e2e4' && request.fen.includes('8/p7/')) {
                Interface.log('Skipping bad FEN response');
                return;
            }
            Interface.log(`Got move: ${move}, depth: ${depth}, engine: ${node_engine_name}`);
            Interface.updateBestMoveProgress(
                engineMode === DEPTH_MODE ? `Depth: ${depth}` : `Move time: ${movetime || 500} ms`);
            moveResult(move.slice(0,2), move.slice(2,4), depth || 10, true);
        },
        onerror: res => {
            console.log('Request failed:', res);
            resetBestMoveBtn();
            Interface.log('Request failed: ' + JSON.stringify(res));
        }
    });
}

function getBestMoves(request) {
    if (engineName === GO_ENGINE_NAME)
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

    if (engineName === ENGINE_NAMES[JS_ENGINE_COUNT]) {
        fetch(`${engineBase}/wasm/${ENGINE_RESOURCES[JS_ENGINE_COUNT]}`).then(r => r.text()).then(src => {
            engineObjectURL = URL.createObjectURL(new Blob([src], { type: 'application/javascript' }));
            loadedEngineName = engineName;
            engine = new Worker(engineObjectURL);
            engine.postMessage('ucinewgame');
            Interface.log('Loaded: ' + ENGINE_NAMES[JS_ENGINE_COUNT]);
        }).catch(e => {
            Interface.log('SF ASM error: ' + e);
        });
        return callback();
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
        if (document.querySelector('.rclock-white.running, .rclock-white .bar.active, .rclock-bottom.running'))
            return 'w';
        if (document.querySelector('.rclock-black.running, .rclock-black .bar.active, .rclock-top.running'))
            return 'b';
        // Fallback: read from FEN
        return fenUtil.getFen().split(' ')[1] || 'w';
    }
 
    updateBoard(false);
    setTimeout(() => sendBestMove(), 300);
 
    let debounceTimer = null;
    const onBoardChange = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const newFen = fenUtil.getFen();
            // return if nothing actually changed
            if (newFen === lastFen) return;
            lastFen = newFen;
 
            const fenTurn = newFen.split(' ')[1]; // 'w' or 'b'
 
            updateBoard(false);
 
            if (fenTurn === playerColor) {
                removeSiteMoveMarkings();
                Interface.boardUtils.removeBestMarkings();
                sendBestMove();
            } else {
                removeSiteMoveMarkings();
                Interface.boardUtils.removeBestMarkings();
                Interface.log(`Opponent's turn (${fenTurn}), cleared highlights.`);
            }
        }, 120);
    };
 
    const cgWrap = document.querySelector('.cg-wrap') || chessBoardElem;
    if (cgWrap) {
        new MutationObserver(onBoardChange).observe(cgWrap, {
            childList:       true,
            subtree:         true,
            attributes:      true,
            attributeFilter: ['class', 'style'],
        });
    }
 
    const fenInput = document.querySelector(
        '.fen-pnl input, .analyse__controls input.fen, input[name="fen"]'
    );
    if (fenInput) {
        new MutationObserver(onBoardChange).observe(fenInput, {
            attributes:      true,
            attributeFilter: ['value'],
        });
        fenInput.addEventListener('input',  onBoardChange);
        fenInput.addEventListener('change', onBoardChange);
    }
 
    if (CURRENT_SITE === LICHESS_ORG) {
        let lastActiveColor = null;
 
        setInterval(() => {
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
                }, 150);
            } else {
                removeSiteMoveMarkings();
                Interface.boardUtils.removeBestMarkings();
            }
        }, 150);
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
    toggleSel('body',                false);
    toggleSel('.card',               true);
    toggleSel('.card-title',         true);
    toggleSel('.form-control',       true);
    toggleSel('label',               true);
    toggleSel('.checkmark',          true);
    toggleSel('input',               true);
    toggleSel('.list-group',         true);
    toggleSel('.card-footer',        true);
    toggleSel('#fen',                false);
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

function openGUI() {
    Gui.open(() => {
        const popDoc  = Gui.document;
        const popHead = popDoc.head;
        const popWin  = Gui.window;
        const q = id => popDoc.querySelector(id);

        const injectScript = (text) => {
            const s = popDoc.createElement('script');
            s.textContent = text;
            popHead.appendChild(s);
        };

        injectScript(GM_getResourceText('jquery.js'));
        injectScript(GM_getResourceText('chessboard.js'));

        const fenEl         = q('#fen');
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
            if (popWin.jQuery && popWin.ChessBoard) {
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

            let uiBoard = popWin.ChessBoard('board', {
                pieceTheme: `${repositoryRawURL}/tampermonkey%20script/content/chesspieces/{piece}.svg`,
                position:   'start',
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
                    uiBoard = popWin.ChessBoard('board', {
                        pieceTheme: `${repositoryRawURL}/tampermonkey%20script/content/chesspieces/{piece}.svg`,
                        position:   fenEl.textContent || 'start',
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
                } catch(e) {
                    console.error('UserGui: Error updating board position:', e);
                }
            }).observe(fenEl, { childList: true, characterData: true, subtree: true });
        };

        waitForLibraries();

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

        fixDepthMoveTimeInput(depthRangeEl, depthRangeNumEl, moveTimeRangeEl, moveTimeRangeNumEl, eloEl);
        const selectedEngine = ENGINE_NAMES.indexOf(engineName);
        if (engineEl) engineEl.selectedIndex = selectedEngine >= 0 ? selectedEngine : 0;
        if (engineModeEl) engineModeEl.selectedIndex = engineMode;
        applyNightMode();

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

        if (CURRENT_SITE === LICHESS_ORG) {
            if (engineEl) engineEl.selectedIndex = JS_ENGINE_COUNT;
            if (maxMovesDivEl)     maxMovesDivEl.style.display     = 'none';
            if (engineNameDivEl)   engineNameDivEl.style.display   = 'none';
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
            engineName = engineEl.value;
            GM_setValue(DB.engineName, engineName);
            const isNode = engineName === GO_ENGINE_NAME;
            if (reloadEngineDivEl) reloadEngineDivEl.style.display = isNode ? 'none' : 'block';
            if (engineNameDivEl) engineNameDivEl.style.display = isNode ? 'block' : 'none';
            if (maxMovesDivEl) maxMovesDivEl.style.display = isNode ? 'none' : 'block';
            if (engineObjectURL) { URL.revokeObjectURL(engineObjectURL); engineObjectURL = null; loadedEngineName = null; }
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

        if (nodeNameEl)        nodeNameEl.onchange        = () => { node_engine_name    = nodeNameEl.value;           GM_setValue(DB.node_engine_name,    node_engine_name);    };
        if (nodeUrlEl)         nodeUrlEl.onchange         = () => { node_engine_url     = nodeUrlEl.value;            GM_setValue(DB.node_engine_url,     node_engine_url);     };
        if (useBookEl)         useBookEl.onchange         = () => { use_book_moves      = useBookEl.checked;          GM_setValue(DB.use_book_moves,      use_book_moves);      };
        if (showOppEl)         showOppEl.onchange         = () => { show_opposite_moves = showOppEl.checked;          GM_setValue(DB.show_opposite_moves, show_opposite_moves); };
        if (displayOnSiteEl)   displayOnSiteEl.onchange   = () => { displayMovesOnSite  = displayOnSiteEl.checked;   GM_setValue(DB.displayMovesOnSite,  displayMovesOnSite);  };
        if (enableUserLogEl)   enableUserLogEl.onchange   = () => { enableUserLog       = enableUserLogEl.checked;   GM_setValue(DB.enableUserLog,       enableUserLog);       };
        if (enableEngineLogEl) enableEngineLogEl.onchange = () => { enableEngineLog     = enableEngineLogEl.checked; GM_setValue(DB.enableEngineLog,     enableEngineLog);     };

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

// Database
async function initializeDatabase(callback) {
    const defaults = {
        nightMode: false, engineMode: 0, engineName: ENGINE_NAMES[0],
        reload_engine: false, reload_every: 10,
        enableUserLog: true, enableEngineLog: true,
        displayMovesOnSite: false, show_opposite_moves: false, use_book_moves: false,
        node_engine_url: 'http://localhost:5000', node_engine_name: 'komodo-201-64',
        current_depth: Math.round(MAX_DEPTH / 2), current_movetime: Math.round(MAX_MOVETIME / 3),
        max_best_moves: 1
    };

    const stored = await GM_getValue(DB.nightMode);

    if (stored === undefined) {
        for (const [k, v] of Object.entries(defaults)) await GM_setValue(DB[k], v);
    }

    nightMode           = await GM_getValue(DB.nightMode);
    engineMode          = await GM_getValue(DB.engineMode);
    engineName         = await GM_getValue(DB.engineName) || ENGINE_NAMES[0];
    reload_engine       = await GM_getValue(DB.reload_engine);
    reload_every        = await GM_getValue(DB.reload_every);
    enableUserLog       = await GM_getValue(DB.enableUserLog);
    enableEngineLog     = await GM_getValue(DB.enableEngineLog);
    displayMovesOnSite  = await GM_getValue(DB.displayMovesOnSite);
    show_opposite_moves = await GM_getValue(DB.show_opposite_moves);
    use_book_moves      = await GM_getValue(DB.use_book_moves);
    node_engine_url     = await GM_getValue(DB.node_engine_url) || 'http://localhost:5000';
    node_engine_name    = await GM_getValue(DB.node_engine_name) || 'komodo-201-64';
    current_depth       = await GM_getValue(DB.current_depth);
    current_movetime    = await GM_getValue(DB.current_movetime);
    max_best_moves      = await GM_getValue(DB.max_best_moves);

    callback();
}

// Entry point
function initialize() {
    Interface  = new InterfaceUtils();
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
        if      (window.location.href.includes('lichess.org')) CURRENT_SITE = LICHESS_ORG;
        else if (window.location.href.includes('chess.com'))   CURRENT_SITE = CHESS_COM;
    }

    if (CURRENT_SITE === LICHESS_ORG) {
        boardElem      = document.querySelector('cg-board') || document.querySelector('.cg-wrap') || document.querySelector('[data-board]');
        firstPieceElem = boardElem?.querySelector('piece:not(.ghost)') ?? boardElem?.querySelector('.cg-piece') ?? boardElem?.querySelector('[data-role]') ?? null;
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