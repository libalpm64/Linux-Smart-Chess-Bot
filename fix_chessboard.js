const fs = require('fs');
const file = 'tampermonkey script/content/chessboard.js';
let content = fs.readFileSync(file, 'utf8');

// Replace $('#' + squareElsIds[...]) with $container.find('#' + squareElsIds[...])
content = content.replace(/\$\('\#' \+ squareElsIds\[([^\]]+)\]\)/g, "$container.find('#' + squareElsIds[$1])");

// Replace $('#' + sparePiecesElsIds[...])
content = content.replace(/\$\('\#' \+ sparePiecesElsIds\[([^\]]+)\]\)/g, "$container.find('#' + sparePiecesElsIds[$1])");

// Replace $('body').append(...)
content = content.replace(/\$\('body'\)\.append\(/g, "$('body', $container[0].ownerDocument).append(");

// Replace var $animatedPiece = $('#' + animatedPieceId)
content = content.replace(/\$\('\#' \+ animatedPieceId\)/g, "$('body', $container[0].ownerDocument).find('#' + animatedPieceId)");

// Replace var $animatedPiece = $('#' + pieceId)
content = content.replace(/\$\('\#' \+ pieceId\)/g, "$('body', $container[0].ownerDocument).find('#' + pieceId)");

// Replace $draggedPiece = $('#' + draggedPieceId)
content = content.replace(/\$\('\#' \+ draggedPieceId\)/g, "$('body', $container[0].ownerDocument).find('#' + draggedPieceId)");

// Replace $('#' + squareElsIds[animation.square] + ' .' + CSS.piece)
content = content.replace(/\$\('\#' \+ squareElsIds\[([^\]]+)\] \+ ' \.' \+ CSS\.piece\)/g, "$container.find('#' + squareElsIds[$1] + ' .' + CSS.piece)");

// Replace $(window) with $($container[0].ownerDocument.defaultView || window)
content = content.replace(/var \$window = \$\(window\)/g, "var $window = $($container[0].ownerDocument.defaultView || window)");

fs.writeFileSync(file, content);
console.log('Fixed chessboard.js');
