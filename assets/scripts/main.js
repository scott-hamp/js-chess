var _chessJS = new Chess();

const _stockfish = STOCKFISH();
var _stockfishIsReady = false;
var _stockfishEnabled = -1;      // -1 = disabled; 0 = enabled; 1 = play as white; 2 = play as black;

_stockfish.onmessage = function (event) {
	stockfishReceiveData(event.data ? event.data : event);
};

var _currentBoardState = null;
var _currentSquareSelected = "";
var _currentSquareSelectedMoves = null;
var _boardStateHistory = null;
var _boardStateHistoryLoadedGame = null;
var _currentPuzzle = null;
var _moveClockSecondTimers = [ 1000, 1000 ];
var _moveClockMillisecondIntervals = 
[
    setInterval(clockMillisecondIntervalTick, 10, 0),
    setInterval(clockMillisecondIntervalTick, 10, 1)
];
var _rightMouseDragFrom = null;
var _boardHighlights = [];
var _boardCanvasArrows = [];
var _boardCanvasSquares = [];
var _sounds = 
[
    new Audio("assets/sounds/move-0.wav"),
    new Audio("assets/sounds/capture-0.wav"),
    new Audio("assets/sounds/castle-0.wav")
];

class BoardState
{
    constructor(fen)
    {
        this.squares = [];
        this.fen = fen;

        if(fen == null || fen.length == 0)
        {
            var board = _chessJS.board();

            var index = 0;
            for(var rank = 0; rank < 8; rank++)
            {
                for(var file = 0; file < 8; file++)
                {
                    var value = board[rank][file];
                    if(value == null)
                        this.squares[index] = "";
                    else
                        this.squares[index] = (value.color == "w") ? value.type.toUpperCase() : value.type;
                    index++;
                }
            }

            this.fen = _chessJS.fen();

            return;
        }

        var fenParts = fen.split(" ");

        if(fenParts.length != 6)
        {
            alert(`FEN string "${fen}" is invalid:\nNumber of parts is incorrect.`);
            return;
        }

        for(var i = 0; i < 6; i++)
        {
            if(i == 0)
            {
                var boardLayoutParts = fenParts[0].split("/");
                if(boardLayoutParts.length != 8)
                {
                    alert(`FEN string "${fen}" is invalid:\nNumber of ranks in board layout is incorrect.`);
                    return;
                }

                for(var rank = 0; rank < 8; rank++)
                {
                    var rankValue = boardLayoutParts[rank];
                    var file = 0;

                    for(var j = 0; j < rankValue.length; j++)
                    {
                        var chr = rankValue[j];
                        if(chr >= 1 && chr <= 8)
                        {
                            var chrInt = parseInt(chr);

                            if(file + chrInt > 8)
                            {
                                alert(`FEN string "${fen}" is invalid:\nRank '${rankValue}' in board layout is invalid.`);
                                return;
                            }

                            for(var k = 0; k < chrInt; k++)
                                this.squares.push("");

                            continue;
                        }

                        var chrLower = chr.toLowerCase();
                        if(chrLower == "p" || chrLower == "n" || chrLower == "b" || chrLower == "r" || chrLower == "q" || chrLower == "k")
                        {
                            this.squares.push(chr);
                            continue;
                        }

                        alert(`FEN string "${fen}" is invalid:\nCharacter '${chr}' in board layout rank ${8 - rank} is invalid.`);
                        return;
                    }
                }
            }
        }
    }
}

class BoardStateHistory
{
    constructor()
    {
        this.atIndex = 0;
        this.comments = [];
        this.moves = [];
        this.states = [];
    }

    add(move, boardState, comment)
    {
        if(this.atIndex == this.moves.length)
        {
            this.comments.push(comment);
            this.moves.push(move);
            this.states.push(boardState);
        }
        else
        {
            this.comments[this.atIndex] = comment;
            this.moves[this.atIndex] = move;
            this.states[this.atIndex] = boardState;

            while(this.moves.length > this.atIndex + 1)
            {
                this.moves.pop();
                this.states.pop();
            }
        }

        this.atIndex++;
    }

    clear()
    {
        this.atIndex = 0;
        while(this.moves.length > 0)
        {
            this.moves.pop();
            this.states.pop();
        }
    }
}

class Vector
{
    constructor(x, y) { this.x = x; this.y = y; }

    add(other) { this.x += other.x; this.y += other.y; }

    subtract(other) { this.x -= other.x; this.y -= other.y; }

    scaleBy(value) { this.x *= value; this.y *= value; }

    length() { return Math.hypot(this.x, this.y); }

    normalize() { this.scaleBy(1 / this.length()); }
    
    rotate(degrees)
    {
        var radians = degrees * (Math.PI/180)
        var cos = Math.cos(radians);
        var sin = Math.sin(radians);

        this.x = Math.round(10000*(this.x * cos - this.y * sin)) / 10000;
        this.y = Math.round(10000*(this.x * sin + this.y * cos)) / 10000;
    };
}

function animateMove(move, completedFunction)
{
    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    function animateMoveSub(color, piece, fromNotation, toNotation, callCompletedFunction)
    {
        var from = getBoardSquarePositionForPositionNotation(fromNotation);
        var to = getBoardSquarePositionForPositionNotation(toNotation);

        document.getElementById(`board-square-td-img_${fromNotation}`).src = "assets/images/empty-0.png";

        var image = new Image();
        image.id = "animating-piece-0-img";
        image.style.position = "absolute";
        image.src = getImageSourceForColorAndPiece({ color: color, piece: piece });
        image.width = boardDivSquareSize;
        image.height = boardDivSquareSize;
        boardDiv.appendChild(image);
        image.style.left = from.x + "px";
        image.style.top = from.y + "px";
        var imagePosition = new Vector(from.x, from.y);

        var moveVector = new Vector(to.x, to.y);
        moveVector.subtract(new Vector(from.x, from.y));
        moveVector.normalize();
        moveVector.scaleBy(positionDistance(from, to) / 20.0);

        var moveInterval = setInterval(() => 
        {
            if(imagePosition.x != to.x || imagePosition.y != to.y)
            {
                imagePosition.x += moveVector.x;
                imagePosition.y += moveVector.y;
                image.style.left = imagePosition.x + "px";
                image.style.top = imagePosition.y + "px";

                if(positionDistance(imagePosition, to) < 10.0)
                    imagePosition = new Vector(to.x, to.y);
            }
            else
            {
                clearInterval(moveInterval);
                boardDiv.removeChild(image);

                if(callCompletedFunction) completedFunction();
            }
        }, 10);
    }

    if(move.san == "O-O" || move.san == "O-O-O")
    {
        var fromNotation = "";
        var toNotation = "";

        if(move.color == 'w')
        {
            if(move.san == "O-O")
            {
                fromNotation = "h1";
                toNotation = "f1";
            }
            else
            {
                fromNotation = "a1";
                toNotation = "d1";
            }
        }
        else
        {
            if(move.san == "O-O")
            {
                fromNotation = "h8";
                toNotation = "f8";
            }
            else
            {
                fromNotation = "a8";
                toNotation = "d8";
            }
        }

        animateMoveSub(move.color, 'r', fromNotation, toNotation, false);
    }
    
    animateMoveSub(move.color, move.piece, move.from, move.to, true);
}

function boardCanvasClear()
{
    _boardCanvasArrows = [];
    _boardCanvasSquares = [];

    var canvas = document.getElementById("board-canvas");
    var context = canvas.getContext("2d");

    context.clearRect(0, 0, canvas.width, canvas.height);
}

function boardCanvasDrawArrow(from, to)
{
    for(var i = 0; i < _boardCanvasArrows.length; i++)
    {
        var arrow = _boardCanvasArrows[i];
        if(arrow.from.x != from.x || arrow.from.y != from.y || arrow.to.x != to.x || arrow.to.y != to.y)
            continue;

        return;
    }

    _boardCanvasArrows.push({ from: from, to: to });

    var canvas = document.getElementById("board-canvas");
    var context = canvas.getContext("2d");

    var size = 30;

    context.fillStyle = "rgb(255, 20, 20, 0.75)";
    context.strokeStyle = "rgb(255, 20, 20, 0.75)";
    context.lineWidth = size;

    var angle = Math.atan2((to.y - from.y), (to.x - from.x));
    var hyp = Math.sqrt((to.x - from.x) * (to.x - from.x) + (to.y - from.y) * (to.y - from.y));

    context.save();
    context.translate(from.x, from.y);
    context.rotate(angle);

    context.beginPath();	
    context.moveTo(0, 0);
    context.lineTo(hyp - size, 0);
    context.stroke();

    context.beginPath();
    context.lineTo(hyp - size, size);
    context.lineTo(hyp, 0);
    context.lineTo(hyp - size, -size);
    context.fill();

    context.restore();
}

function boardCanvasDrawSquare(atCenter)
{
    for(var i = 0; i < _boardCanvasSquares.length; i++)
    {
        var square = _boardCanvasSquares[i];
        if(square.atCenter.x != atCenter.x || square.atCenter.y != atCenter.y)
            continue;

        return;
    }

    _boardCanvasSquares.push({ atCenter: atCenter });

    var canvas = document.getElementById("board-canvas");
    var context = canvas.getContext("2d");

    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    context.fillStyle = "rgb(255, 20, 20, 0.75)";

    context.moveTo(0, 0);
    context.beginPath();
    context.lineTo(atCenter.x - boardDivSquareSize / 2, atCenter.y - boardDivSquareSize / 2);
    context.lineTo(atCenter.x + boardDivSquareSize / 2, atCenter.y - boardDivSquareSize / 2);
    context.lineTo(atCenter.x + boardDivSquareSize / 2, atCenter.y + boardDivSquareSize / 2);
    context.lineTo(atCenter.x - boardDivSquareSize / 2, atCenter.y + boardDivSquareSize / 2);
    context.fill();
}

function boardSquareSelected(positionNotation, mouseEventType)
{
    var rank = 8 - parseInt(positionNotation[1]);
    var file = positionNotation.charCodeAt(0) - 'a'.charCodeAt(0);
    var index = (rank * 8) + file;
    var squareValue = _currentBoardState.squares[index];

    /*
    var positionDescription = "empty";
    if(squareValue.length > 0)
    {
        var color = (squareValue == squareValue.toUpperCase()) ? "white" : "black";
        var piece = "";

        var squareValueLower = squareValue.toLowerCase();
        if(squareValueLower == "p") piece = "pawn";
        if(squareValueLower == "k") piece = "knight";
        if(squareValueLower == "b") piece = "bishop";
        if(squareValueLower == "r") piece = "rook";
        if(squareValueLower == "q") piece = "queen";
        if(squareValueLower == "k") piece = "king";

        positionDescription = color + " " + piece;
    }

    console.log(`Square selected: ${positionNotation} == ${positionDescription}`);
    */

    if(_currentSquareSelected != "")
    {
        var boardDraggingPieceDiv = document.getElementById("board-dragging-piece-div");
        boardDraggingPieceDiv.innerHTML = "";

        for(var i = 0; i < _currentSquareSelectedMoves.length; i++)
        {
            var move = _currentSquareSelectedMoves[i];
            if(move.to == positionNotation)
            {
                makeMoveFromCurrentBoardState(move, false);
                return;
            }
        }

        var colorAndPiece = getColorAndPieceForPositionNotation(_currentSquareSelected); 
        var imageSrc = getImageSourceForColorAndPiece(colorAndPiece);
        document.getElementById(`board-square-td-img_${_currentSquareSelected}`).src = imageSrc;
    }
    
    if(squareValue != "")
    {
        if(mouseEventType == "down")
        {
            if((_chessJS.turn() == 'w' && squareValue.toLowerCase() != squareValue) || (_chessJS.turn() == 'b' && squareValue.toLowerCase() == squareValue))
            {
                _currentSquareSelected = positionNotation;
                _currentSquareSelectedMoves = _chessJS.moves({ square: positionNotation, verbose: true });
                var rankAndFile = getRankAndFileForPositionNotation(positionNotation);
                var colorAndPiece = getColorAndPieceForPositionNotation(positionNotation); 
                var imageSrc = getImageSourceForColorAndPiece(colorAndPiece);

                var boardDiv = document.getElementById("board-div");
                var boardDivRect = boardDiv.getBoundingClientRect();
                var boardDivSize = (boardDivRect.right - boardDivRect.left);
                var boardDivSquareSize = boardDivSize / 8;

                document.getElementById(`board-square-td-img_${positionNotation}`).src = "assets/images/empty-0.png";
                var boardDraggingPieceDiv = document.getElementById("board-dragging-piece-div");
                boardDraggingPieceDiv.innerHTML = `<img src="${imageSrc}" />`;
                boardDraggingPieceDiv.style.left = ((rankAndFile.file * boardDivSquareSize)) + "px";
                boardDraggingPieceDiv.style.top = ((rankAndFile.rank * boardDivSquareSize)) + "px";

                boardDiv.style.cursor = "grabbing !important";
            }
        }
        else
        {
            if(_currentSquareSelected == positionNotation)
                document.getElementById(`board-square-td-img_${positionNotation}`).src = getImageSourceForColorAndPiece(getColorAndPieceForPositionNotation(positionNotation));

            _currentSquareSelected = "";
            _currentSquareSelectedMoves = null;
        }
    }
}

function buildBoardSquaresTable()
{
    var boardSquaresTable = document.getElementById("board-squares-table");
    var innerHTML = "";
    var bgColorIndex = 0;

    for(var rank = 0; rank < 8; rank++)
    {
        innerHTML += "<tr>";
        for(var file = 0; file < 8; file++)
        {
            var bgColor = (bgColorIndex % 2 == 0) ? "rgb(240, 219, 174)" : "rgb(193, 136, 93)";
            var positionNotation = getPositionNotationForRankAndFile(rank, file);

            innerHTML += `<td id="board-square-td_${positionNotation}" class="board-square-td" style="background-color: ${bgColor}"><img id="board-square-td-img_${positionNotation}" src="assets/images/empty-0.png" width=90 height=90 onmousedown="boardSquare_onMouseDown(event, '${positionNotation}')" onmouseup="boardSquare_onMouseUp(event, '${positionNotation}')" /></td>`;
            
            bgColorIndex++;
        }
        innerHTML += "</tr>";
        bgColorIndex++;
    }

    boardSquaresTable.innerHTML = innerHTML;
}

function clearBoardHighlights()
{
    _boardHighlights = [];
    updateBoardSquaresTableFromBoardState(_currentBoardState);
}

function clockMillisecondIntervalTick(turn)
{
    var select = document.getElementById("controls-time-select");

    if(select.selectedIndex == 0) return;
    if(!((_chessJS.turn() == 'w' && turn == 0) || (_chessJS.turn() == 'b' && turn == 1)))
        return;

    _moveClockSecondTimers[turn] -= 10;

    if(_moveClockSecondTimers[turn] > 0) return;
    _moveClockSecondTimers[turn] += 1000;

    var span = (turn == 0) ? document.getElementById("controls-time-white-span") : document.getElementById("controls-time-black-span");
    var textContentParts = span.textContent.split(":");
    var minutes = parseInt(textContentParts[0]);
    var seconds = parseInt(textContentParts[1]);

    if(minutes == 0 && seconds == 0) return;

    seconds--;

    if(seconds < 0)
    {
        minutes--;
        seconds = 59;
    }

    span.textContent = `${minutes}:${seconds}`;
}

function getBoardSquareCenterPosition(moveEventClientPosition)
{
    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    var x = (Math.floor(((moveEventClientPosition.x - boardDivRect.left) / boardDivSize) * 8) * boardDivSquareSize) + (boardDivSquareSize / 2);
    var y = (Math.floor(((moveEventClientPosition.y - boardDivRect.top) / boardDivSize) * 8) * boardDivSquareSize) + (boardDivSquareSize / 2);

    return { x: x, y: y };
}

function getBoardSquarePositionForPositionNotation(notation)
{
    var rankFile = getRankAndFileForPositionNotation(notation);

    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    return { x: rankFile.file * boardDivSquareSize, y: rankFile.rank * boardDivSquareSize };
}

function getColorAndPieceForPositionNotation(notation)
{
    var rankAndFile = getRankAndFileForPositionNotation(notation);
    var value = _currentBoardState.squares[(rankAndFile.rank * 8) + rankAndFile.file];
    var color = "";
    var piece = "";

    if(value != "")
    {
        piece = value.toLowerCase();
        color = (value == value.toLowerCase()) ? "b" : "w";
    }

    return { color: color, piece: piece };
}

function getImageSourceForColorAndPiece(colorAndPiece)
{
    var piece = colorAndPiece.piece.toLowerCase();
    var src = "assets/images/";

    if(piece == 'p') src += "pawn-";
    if(piece == 'n') src += "knight-";
    if(piece == 'b') src += "bishop-";
    if(piece == 'r') src += "rook-";
    if(piece == 'q') src += "queen-";
    if(piece == 'k') src += "king-";

    src += (colorAndPiece.color == 'w') ? '0' : '1';

    src += ".png";

    return src;
}

function getMoveForNotation(notation)
{
    if(notation.length != 4) return null;

    var moves = _chessJS.moves({ verbose: true });
    var from = notation.substring(0, 2);
    var to = notation.substring(2);

    for(var i = 0; i < moves.length; i++)
    {
        var move = moves[i];

        if(move.san == notation) return move;
        if(move.from != from || move.to != to) continue;

        return move;
    }

    return null;
}

function getPositionNotationForBoardSquareValue(value)
{
    var squareIndex = 0;
    for(var rank = 0; rank < 8; rank++)
    {
        for(var file = 0; file < 8; file++)
        {
            var squareValue = _currentBoardState.squares[squareIndex];
            var positionNotation = getPositionNotationForRankAndFile(rank, file);

            if(squareValue == value) return positionNotation;

            squareIndex++;
        }
    }

    return "";
}

function getPositionNotationForRankAndFile(rank, file)
{
    var fileLetters = [ "a", "b", "c", "d", "e", "f", "g", "h" ];

    return fileLetters[file] + (8 - rank);
}

function getRankAndFileForPositionNotation(notation)
{
    var fileLetters = [ "a", "b", "c", "d", "e", "f", "g", "h" ];

    var rank = 8 - parseInt(notation[1]);
    var file = 0;

    for(var i = 0; i < 8; i++)
    {
        if(notation[0] != fileLetters[i]) continue;
        file = i;
        break;
    }

    return { rank: rank, file: file };
}

function loadGame()
{
	var element = document.getElementById("loadGameInput");
	var files = element.files;
	if (files.length == 0) return;

	var fileReader = new FileReader();

	fileReader.onload = (e) => 
	{
        reset();

        var fileContent = e.target.result;
        element.value = null;

		_chessJS.load_pgn(fileContent);
        _boardStateHistory.clear();
        _boardStateHistoryLoadedGame = new BoardStateHistory();

        chessJSAlt = new Chess();
        chessJSAlt.load("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

        var history = _chessJS.history({ verbose: true });
        for(var i = 0; i < history.length; i++)
        {
            var move = history[i];
            chessJSAlt.move(move.san);

            var fen = chessJSAlt.fen();
            var boardState = new BoardState(fen);
            var comments = _chessJS.get_comments();
            var comment = "";

            for(var j = 0; j < comments.length; j++)
            {
                if(comments[j].fen != fen) continue;
                comment = comments[j].comment;
                break;
            }

            _boardStateHistory.add(move, boardState, comment);
            _boardStateHistoryLoadedGame.add(move, boardState, comment);

            updateControlsOpeningDiv(chessJSAlt.history());
        }

        _currentBoardState = new BoardState(chessJSAlt.fen);

        updateBoardSquaresTableFromBoardState(_currentBoardState);
        updateControlsFENInput();
        updateControlsMovesTable();
        updateGameDetailsMoveCommentTextArea();

        var pgn = _chessJS.pgn();
        pgn = pgn.replaceAll("[", "").replaceAll("]", "");
        var pgnLines = pgn.split("\n");
        for(var i = 0; i < pgnLines.length; i++)
        {
            var pgnLine = pgnLines[i].trim();
            if(pgnLine.length == 0) break;

            var pgnLineParts = pgnLine.split("\"");
            var key = pgnLineParts[0].trim().toLowerCase();
            var value = pgnLineParts[1].trim();

            var input = document.getElementById(`controls-game-details-${key}-input`);
            if(input == null) continue;

            input.value = value;
        }

        document.getElementById("controls-game-button-first-move").disabled = false;
        document.getElementById("controls-game-button-previous-move").disabled = false;
        document.getElementById("controls-game-button-next-move").disabled = false;
        document.getElementById("controls-game-button-last-move").disabled = false;
        document.getElementById("controls-game-button-save").disabled = false;
        document.getElementById("controls-game-button-reset").disabled = false;
	};

	fileReader.onerror = (e) => alert(`Could not load file "${e.target.error.name}".`);

	fileReader.readAsText(files[0]);
}

function makeMoveFromCurrentBoardState(move, animate)
{
    clearBoardHighlights();

    function completedActions()
    {
        _chessJS.move(move.san);
        setCurrentBoardStateToChessJSBoard();
        _currentSquareSelected = "";
        _boardStateHistory.add(move, _currentBoardState, _chessJS.get_comment());

        playSoundForMove(move);

        if(_stockfishEnabled > -1 && !_chessJS.in_checkmate()) 
            stockfishUpdate(move);

        if(_chessJS.in_check() || _chessJS.in_checkmate())
        {
            var value = (_chessJS.turn() == 'w') ? 'K' : 'k';
            var highlight = (_chessJS.in_check()) ? "check" : "checkmate";
            setBoardHighlight(getPositionNotationForBoardSquareValue(value), highlight);
        }

        updateBoardSquaresTableFromBoardState(_currentBoardState);
        updateControlsFENInput();
        updateControlsMovesTable();
        updateControlsOpeningDiv();

        document.getElementById("controls-game-button-first-move").disabled = false;
        document.getElementById("controls-game-button-previous-move").disabled = false;
        document.getElementById("controls-game-button-next-move").disabled = false;
        document.getElementById("controls-game-button-last-move").disabled = false;
        document.getElementById("controls-game-button-save").disabled = false;

        console.log(`Move: ${move.san}`);
    }
    
    setBoardHighlight(move.from, "from");
    setBoardHighlight(move.to, "to");

    if(animate)
        animateMove(move, completedActions);
    else
        completedActions();
}

function makeMoveFromCurrentBoardStateFromTo(moveAsFromTo)
{
    var move = getMoveForNotation(moveAsFromTo);

    if(move == null) return;

    makeMoveFromCurrentBoardState(move, true);
}

function playSoundForMove(move)
{
    if(move.san.includes("x"))
        _sounds[1].play();
    else
    {
        if(move.san == "O-O" || move.san == "O-O-O")
            _sounds[2].play();
        else
            _sounds[0].play();
    }
}

function positionDistance(from, to)
{
    var xs = to.x - from.x;
    var ys = to.y - from.y;	
	
	xs *= xs;
	ys *= ys;
	 
	return Math.sqrt(xs + ys);
}

function preloadImage(src)
{
    var img = new Image();
    img.src = src;
}

function preloadImages()
{
    var imageSources = 
    [
        "assets/images/empty-0.png",
        "assets/images/pawn-0.png",
        "assets/images/knight-0.png",
        "assets/images/bishop-0.png",
        "assets/images/rook-0.png",
        "assets/images/queen-0.png",
        "assets/images/king-0.png",
        "assets/images/pawn-1.png",
        "assets/images/knight-1.png",
        "assets/images/bishop-1.png",
        "assets/images/rook-1.png",
        "assets/images/queen-1.png",
        "assets/images/king-1.png"
    ];

    for(var i = 0; i < imageSources.length; i++)
        preloadImage(imageSources[i]);
}

function reset()
{
    _chessJS.reset();
    setCurrentBoardStateToChessJSBoard();
    _boardStateHistory.clear();
    _boardStateHistoryLoadedGame = null;
    _currentSquareSelected = "";
    _currentPuzzle = null;

    clearBoardHighlights();
    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateGameDetailsMoveCommentTextArea();
    updateControlsOpeningDiv();
    updateControlsPuzzleDiv();

    boardCanvasClear();
    resetMoveClocks();

    var gameDetailsFields = 
    [
        "white",
        "black",
        "event",
        "site",
        "date",
        "eventdate",
        "result"
    ];

    for(var i = 0; i < gameDetailsFields.length; i++)
    {
        var input = document.getElementById(`controls-game-details-${gameDetailsFields[i]}-input`);
        if(input == null) continue;

        input.value = "";
    }

    document.getElementById("controls-game-button-first-move").disabled = true;
    document.getElementById("controls-game-button-previous-move").disabled = true;
    document.getElementById("controls-game-button-next-move").disabled = true;
    document.getElementById("controls-game-button-last-move").disabled = true;
    document.getElementById("controls-game-button-save").disabled = true;
    document.getElementById("controls-game-button-reset").disabled = true;
    document.getElementById("controls-reset-puzzle-button").disabled = true;
}

function resetCurrentPuzzle()
{
    if(_currentPuzzle == null) return;

    _chessJS.reset();
    setCurrentBoardStateToChessJSBoard();
    _currentSquareSelected = "";
    _boardStateHistory.clear();

    setCurrentBoardStateToFEN(_currentPuzzle.FEN);

    if(_currentPuzzle.instructions.toLowerCase().includes("black"))
        _boardStateHistory.add(null, null, "");

    boardCanvasClear();
    resetMoveClocks();

    clearBoardHighlights();
    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateGameDetailsMoveCommentTextArea();

    document.getElementById("controls-reset-puzzle-button").disabled = false;
}

function resetMoveClocks()
{
    var select = document.getElementById("controls-time-select");

    var timeSpans = 
    [
        document.getElementById("controls-time-white-span"),
        document.getElementById("controls-time-black-span")
    ];

    var time = 0;

    if(select.selectedIndex == 1)
        time = 90;
    if(select.selectedIndex == 2)
        time = 10;
    if(select.selectedIndex == 3)
        time = 5;
    if(select.selectedIndex == 4)
        time = 3;

    _moveClockSecondTimers = [ 1000, 1000 ];

    for(var i = 0; i < 2; i++)
        timeSpans[i].textContent = `${time}:00`;
}

function saveGame() 
{
    var content = "";
    var result = "?";
    var date = new Date();

    var headers = 
    [
        "White",
        "Black",
        "Event",
        "Site",
        "Date",
        "EventDate",
        "Result"
    ];

    for(var i = 0; i < headers.length; i++)
    {
        var input = document.getElementById(`controls-game-details-${headers[i].toLowerCase()}-input`);
        if(input == null) continue;

        var inputValue = input.value.trim();
        if(inputValue.length == 0)
        {
            inputValue = "?";
            if(headers[i] == "Date")
                inputValue = `${date.getFullYear()}.${date.getMonth()}.${date.getDate()}`;
            if(headers[i] == "EventDate")
                inputValue = `${date.getFullYear()}.${date.getMonth()}.${date.getDate()}`;
            if(headers[i] == "Result" && _chessJS.in_checkmate())
            {
                result = (_chessJS.turn() == 'w') ? "1-0" : "0-1";
                inputValue = result;
            }
        }

        content += `[${headers[i]} "${inputValue}"]\n`;
    }

    content += "\n";
    var fullMoveNumber = 1;
    for(var i = 0; i < _boardStateHistory.moves.length; i += 2)
    {
        var moveWhite = _boardStateHistory.moves[i];
        content += `${fullMoveNumber}. ${moveWhite.san} `;

        var comment = _boardStateHistory.comments[i];
        if(comment != null)
        {
            comment = comment.trim();
            if(comment.length > 0) content += `{${comment}} `;
        }

        if(i < _boardStateHistory.moves.length - 1)
        {
            var moveBlack = _boardStateHistory.moves[i + 1];
            content += `${moveBlack.san} `;

            comment = _boardStateHistory.comments[i + 1];
            if(comment != null)
            {
                comment = comment.trim();
                if(comment.length > 0) content += `{${comment}} `;
            }
        }

        fullMoveNumber++;
    }
    content += result;

    var blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    var link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "game.pgn");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    //window.open("data:application/txt," + encodeURIComponent(content), "_self");
}

function selectOpening(opening)
{
    reset();

    for(var i = 0; i < opening.moves.length; i++)
    {
        _chessJS.move(opening.moves[i]);
        setCurrentBoardStateToChessJSBoard();
        var history = _chessJS.history({ verbose: true });
        var move = history[history.length - 1];
        _boardStateHistory.add(move, _currentBoardState, "");
    }

    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateControlsOpeningDiv();
}

function selectRandomPuzzle()
{
    reset();

    var puzzle = getRandomPuzzle();
    _currentPuzzle = puzzle;

    setCurrentBoardStateToFEN(_currentPuzzle.FEN);

    if(_currentPuzzle.instructions.toLowerCase().includes("black"))
        _boardStateHistory.add(null, null, "");

    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateControlsOpeningDiv();
    updateControlsPuzzleDiv();

    document.getElementById("controls-reset-puzzle-button").disabled = false;
}

function setBoardHighlight(positionNotation, highlightType)
{
    for(var i = 0; i < _boardHighlights.length; i++)
    {
        if(_boardHighlights[i].position == positionNotation)
        {
            _boardHighlights[i].highlight = highlightType;
            return;
        }
    }

    _boardHighlights.push({ position: positionNotation, highlight: highlightType });
    updateBoardSquaresTableFromBoardState(_currentBoardState);
}

function setCurrentBoardStateByMoveIndex(moveIndex)
{
    var state = _boardStateHistory.states[moveIndex];
    if(state == null)
    {
        if(_currentPuzzle != null) resetCurrentPuzzle();
        return;
    }

    _currentSquareSelected = "";
    _boardStateHistory.atIndex = moveIndex + 1;

    setCurrentBoardStateToFEN(state.fen);

    boardCanvasClear();
    clearBoardHighlights();
    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateGameDetailsMoveCommentTextArea();
}

function setCurrentBoardStateToChessJSBoard()
{
    _currentBoardState = new BoardState();
}

function setCurrentBoardStateToFEN(fen)
{
    _chessJS.load(fen);
    setCurrentBoardStateToChessJSBoard();
}

function setup()
{
    buildBoardSquaresTable();

    setupChessJS();
    setCurrentBoardStateToChessJSBoard();
    _boardStateHistory = new BoardStateHistory();

    stockfishPostMessage("uci");

    loadOpenings();
    loadPuzzles();

    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();

    var boardDiv = document.getElementById("board-div");
    boardDiv.addEventListener('contextmenu', event => event.preventDefault());
}

function setupChessJS()
{
    _chessJS.load("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

function stockfishBestMoveDecided(moveAsFromTo) 
{
    if(_stockfishEnabled == -1) return;

    if(_stockfishEnabled == 0)
    {
        var move = getMoveForNotation(moveAsFromTo);
        var moveValue = (move == null) ? moveAsFromTo : move.san;

        stockfishUpdateMessage(`Best move: ${moveValue}.`);
        
        return;
    }

    stockfishUpdateMessage("Ready.");

    if(((_chessJS.turn() == 'w' && _stockfishEnabled == 1) || (_chessJS.turn() == 'b' && _stockfishEnabled == 2)))
    {
        stockfishUpdateMessage("Moving...");
        makeMoveFromCurrentBoardStateFromTo(moveAsFromTo);
    }
}

function stockfishPostMessage(message) 
{
	_stockfish.postMessage(message);
}

function stockfishReceiveData(data) 
{
	console.log(`stockfishReceiveData: "${data}"`);

	if (!_stockfishIsReady) 
    {
		if (data == "uciok") 
        {
			_stockfishIsReady = true;

			stockfishUpdateMessage("Ready.");
		}

		return;
	}

    stockfishUpdateMessage("Ready.");

	var parts = data.split(" ");

	if (parts[0] == "bestmove")
		stockfishBestMoveDecided(parts[1]);
}

function stockfishUpdate(move) 
{
	if (!_stockfishIsReady) return;

	if (move != null) 
    {
		var moveAsFromTo = move.from + move.to;

		stockfishPostMessage("position fen " + _chessJS.fen() + " moves " + moveAsFromTo);
	}
	else
        stockfishPostMessage("position fen " + _chessJS.fen());

    stockfishUpdateMessage("Thinking...");

    setTimeout(() => {
        stockfishPostMessage("go depth 10");
    }, 1000);
}

function stockfishUpdateMessage(message)
{
    console.log("Stockfish: " + message);

    document.getElementById("controls-stockfish-message-span").textContent = message;
}

function updateBoardSquaresTableFromBoardState(boardState)
{
    var boardSquaresTable = document.getElementById("board-squares-table");
    var squareIndex = 0;
    var bgColorIndex = 0;

    for(var rank = 0; rank < 8; rank++)
    {
        for(var file = 0; file < 8; file++)
        {
            var squareValue = boardState.squares[squareIndex];
            var positionNotation = getPositionNotationForRankAndFile(rank, file);
            var boardSquareTD = document.getElementById(`board-square-td_${positionNotation}`);
            var boardSquareTDImg = document.getElementById(`board-square-td-img_${positionNotation}`);
            var bgColor = (bgColorIndex % 2 == 0) ? "rgb(240, 219, 174)" : "rgb(193, 136, 93)";

            boardSquareTD.style.backgroundColor = bgColor;

            for(var i = 0; i < _boardHighlights.length; i++)
            {
                if(_boardHighlights[i].position == positionNotation)
                {
                    var bgColorHighlight = "white";
                    if(_boardHighlights[i].highlight == "check")
                        bgColorHighlight = "rgb(255, 100, 100)";
                    if(_boardHighlights[i].highlight == "checkmate")
                        bgColorHighlight = "rgb(255, 0, 0)";
                    if(_boardHighlights[i].highlight == "from")
                        bgColorHighlight = "rgb(210, 210, 0)";
                    if(_boardHighlights[i].highlight == "to")
                        bgColorHighlight = "rgb(225, 225, 0)";

                    boardSquareTD.style.backgroundColor = bgColorHighlight;
                    break;
                }
            }

            if(squareValue == "") boardSquareTDImg.src = "assets/images/empty-0.png";
            if(squareValue == "P") boardSquareTDImg.src = "assets/images/pawn-0.png";
            if(squareValue == "N") boardSquareTDImg.src = "assets/images/knight-0.png";
            if(squareValue == "B") boardSquareTDImg.src = "assets/images/bishop-0.png";
            if(squareValue == "R") boardSquareTDImg.src = "assets/images/rook-0.png";
            if(squareValue == "Q") boardSquareTDImg.src = "assets/images/queen-0.png";
            if(squareValue == "K") boardSquareTDImg.src = "assets/images/king-0.png";
            if(squareValue == "p") boardSquareTDImg.src = "assets/images/pawn-1.png";
            if(squareValue == "n") boardSquareTDImg.src = "assets/images/knight-1.png";
            if(squareValue == "b") boardSquareTDImg.src = "assets/images/bishop-1.png";
            if(squareValue == "r") boardSquareTDImg.src = "assets/images/rook-1.png";
            if(squareValue == "q") boardSquareTDImg.src = "assets/images/queen-1.png";
            if(squareValue == "k") boardSquareTDImg.src = "assets/images/king-1.png";

            if(_chessJS.turn() == 'w')
            {
                if(squareValue.toLowerCase() != squareValue)
                    boardSquareTDImg.style.cursor = "pointer";
                else
                    boardSquareTDImg.style.cursor = "default";
            }
            else
            {
                if(squareValue.toLowerCase() == squareValue)
                    boardSquareTDImg.style.cursor = "pointer";
                else
                    boardSquareTDImg.style.cursor = "default";
            }

            squareIndex++;
            bgColorIndex++;
        }

        bgColorIndex++;
    }
}

function updateControlsFENInput()
{
    var input = document.getElementById("controls-fen-input");
    input.value = _chessJS.fen();
}

function updateControlsMovesTable()
{
    var controlsMovesTable = document.getElementById("controls-game-moves-table");
    var innerHTML = "";

    if(_boardStateHistoryLoadedGame != null)
    {
        var divergenceFound = false;
        for(var i = 0; i < Math.max(_boardStateHistory.moves.length, _boardStateHistoryLoadedGame.moves.length); i++)
        {
            innerHTML += `<tr><td style="text-align: center;">${(i / 2) + 1}. </td>`;
            for(var j = i; j < Math.min(i + 2, Math.max(_boardStateHistory.moves.length, _boardStateHistoryLoadedGame.moves.length)); j++)
            {
                var moveBSH = _boardStateHistory.moves[j];
                var moveBSHLG = _boardStateHistoryLoadedGame.moves[j];

                var san = "...";
                var foregroundColor = (divergenceFound) ? "red" : "black";
                var backgroundColor = "white";

                if(moveBSH != null)
                {
                    san = moveBSH.san;
                    if(j == _boardStateHistory.atIndex - 1)
                        backgroundColor = "lightgray";
                }
                else
                {
                    san = moveBSHLG.san;
                    if(j == _boardStateHistoryLoadedGame.atIndex - 1)
                        backgroundColor = "lightgray";
                }
                
                innerHTML += `<td id="controls-game-moves-table-td_${j}" class="controls-game-moves-table-cell" style="color: ${foregroundColor} ; background-color: ${backgroundColor}" onmousedown="controlsGamesMovesTableCell_onMouseDown(${j})">${san}</td>`;

                if(moveBSH != null && moveBSHLG != null && moveBSH != moveBSHLG)
                    divergenceFound = true;
            }
            innerHTML += "</tr>";
            i++;
        }
    }
    else
    {
        for(var i = 0; i < _boardStateHistory.moves.length; i++)
        {
            innerHTML += `<tr><td style="text-align: center;">${(i / 2) + 1}. </td>`;
            for(var j = i; j < Math.min(i + 2, _boardStateHistory.moves.length); j++)
            {
                var move = _boardStateHistory.moves[j];

                var backgroundColor = (j == _boardStateHistory.atIndex - 1) ? "lightgray" : "white";
                var san = (move != null) ? move.san : "...";
                
                innerHTML += `<td id="controls-game-moves-table-td_${j}" class="controls-game-moves-table-cell" style="background-color: ${backgroundColor}" onmousedown="controlsGamesMovesTableCell_onMouseDown(${j})">${san}</td>`;
            }
            innerHTML += "</tr>";
            i++;
        }
    }

    controlsMovesTable.innerHTML = innerHTML;
}

function updateControlsOpeningDiv(moves)
{
    if(moves == null) moves = _chessJS.history();
    var controlsOpeningDiv = document.getElementById("controls-opening-div");

    if(moves.length == 0)
    {
        controlsOpeningDiv.innerHTML = "...";
        return;
    }

    var opening = getOpeningWithMoves(moves);
    var innerHTML = controlsOpeningDiv.innerHTML;

    if(opening == null)
    {
        if(innerHTML != "...")
        {
            innerHTML = innerHTML.replace("...", "").trim();
            innerHTML += " ...";
        }
    }
    else
        innerHTML = `(${opening.ECOCode}) ${opening.name}`;

    controlsOpeningDiv.innerHTML = innerHTML;
}

function updateControlsPuzzleDiv()
{
    var controlsPuzzleDiv = document.getElementById("controls-puzzle-div");
    var innerHTML = "";

    if(_currentPuzzle != null)
    {
        innerHTML = `<table><tr><td>${_currentPuzzle.instructions} (${_currentPuzzle.description})</td>`;
        innerHTML += `<td><img src="assets/images/info-0.png" width="20" height="20" title="${_currentPuzzle.solution}" style="padding-left: 10px; cursor: pointer;" onmousedown="alert('${_currentPuzzle.solution}');" /></td></tr></table>`;
    }

    controlsPuzzleDiv.innerHTML = innerHTML;
}

function updateGameDetailsMoveCommentTextArea()
{
    var comment = _boardStateHistory.comments[_boardStateHistory.atIndex]
    if(comment == null) comment = "";

    document.getElementById("controls-game-details-move-comment-text-area").value = comment;
}

function boardDiv_onMouseDown(mouseEvent)
{
    if(mouseEvent.button == 0)
    {
        boardCanvasClear();
        return;
    }

    if(mouseEvent.button != 2) return;

    _rightMouseDragFrom = getBoardSquareCenterPosition({ x: mouseEvent.clientX, y: mouseEvent.clientY });
}

function boardDiv_onMouseMove(mouseEvent)
{
    if(_currentSquareSelected == "") return;

    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    var boardDraggingPieceDiv = document.getElementById("board-dragging-piece-div");
    boardDraggingPieceDiv.style.left = (mouseEvent.clientX - boardDivSquareSize + (boardDivSquareSize / 3.5)) + "px";
    boardDraggingPieceDiv.style.top = (mouseEvent.clientY - boardDivSquareSize + (boardDivSquareSize / 3.5)) + "px";
}

function boardDiv_onMouseUp(mouseEvent)
{
    if(mouseEvent.button != 2 || _rightMouseDragFrom == null) return;

    var to = getBoardSquareCenterPosition({ x: mouseEvent.clientX, y: mouseEvent.clientY });

    if(_rightMouseDragFrom.x == to.x && _rightMouseDragFrom.y == to.y)
        boardCanvasDrawSquare(to);
    else
        boardCanvasDrawArrow(_rightMouseDragFrom, to);

    _rightMouseDragFrom = null;
}

function boardSquare_onMouseDown(mouseEvent, positionNotation)
{
    if(mouseEvent.button != 0) return;

    boardSquareSelected(positionNotation, "down");
}

function boardSquare_onMouseUp(mouseEvent, positionNotation)
{
    if(mouseEvent.button != 0) return;
    if(_currentSquareSelected == "") return;

    boardSquareSelected(positionNotation, "up");

    document.getElementById("board-div").style.cursor = "default !important";
}

function body_onLoad()
{
    setup();
}

function controlsGameButton_onClick(descriptor)
{
    if(descriptor == "to-start")
    {
        setCurrentBoardStateByMoveIndex(0);
        return;
    }

    if(descriptor == "previous")
    {
        _boardStateHistory.atIndex = Math.max(_boardStateHistory.atIndex - 2, 0);

        setCurrentBoardStateByMoveIndex(_boardStateHistory.atIndex);
        return;
    }

    if(descriptor == "next")
    {
        _boardStateHistory.atIndex = Math.min(_boardStateHistory.atIndex, _boardStateHistory.moves.length - 1);
        
        var move = _boardStateHistory.moves[_boardStateHistory.atIndex];

        document.getElementById(`board-square-td-img_${move.from}`).src = "assets/images/empty-0.png";
        boardCanvasClear();
        setBoardHighlight(move.from, "from");
        setBoardHighlight(move.to, "to");

        animateMove(move, () => 
        {
            setCurrentBoardStateByMoveIndex(_boardStateHistory.atIndex);

            setBoardHighlight(move.from, "from");
            setBoardHighlight(move.to, "to");

            if(_chessJS.in_check() || _chessJS.in_checkmate())
            {
                var value = (_chessJS.turn() == 'w') ? 'K' : 'k';
                var highlight = (_chessJS.in_check()) ? "check" : "checkmate";
                setBoardHighlight(getPositionNotationForBoardSquareValue(value), highlight);
            }

            playSoundForMove(move);
        });

        return;
    }

    if(descriptor == "to-end")
    {
        setCurrentBoardStateByMoveIndex(_boardStateHistory.moves.length - 1);
        return;
    }

    if(descriptor == "save")
    {
        saveGame();
        return;
    }

    if(descriptor == "load")
    {
        document.getElementById("loadGameInput").click();
        return;
    }

    if(descriptor == "reset")
    {
        if(_boardStateHistoryLoadedGame == null) return;

        var atIndex = _boardStateHistory.atIndex;
        if(atIndex > _boardStateHistoryLoadedGame.moves.length)
            atIndex = _boardStateHistoryLoadedGame.moves.length - 1;

        var divergenceAt = -1;
        for(var i = 0; i < Math.max(_boardStateHistory.moves.length, _boardStateHistoryLoadedGame.moves.length); i++)
        {
            for(var j = i; j < Math.min(i + 2, Math.max(_boardStateHistory.moves.length, _boardStateHistoryLoadedGame.moves.length)); j++)
            {
                var moveBSH = _boardStateHistory.moves[j];
                var moveBSHLG = _boardStateHistoryLoadedGame.moves[j];
                
                if(moveBSH != null && moveBSHLG != null && moveBSH != moveBSHLG)
                {
                    divergenceAt = j;
                    break;
                }
            }
            i++;

            if(divergenceAt != -1) break;
        }

        if(divergenceAt != -1) atIndex = divergenceAt;

        _boardStateHistory.clear();
        for(var i = 0; i < _boardStateHistoryLoadedGame.moves.length; i++)
            _boardStateHistory.add(_boardStateHistoryLoadedGame.moves[i], _boardStateHistoryLoadedGame.states[i], _boardStateHistoryLoadedGame.comments[i]);

        setCurrentBoardStateByMoveIndex(atIndex - 1);

        return;
    }
}

function controlsGamesMovesTableCell_onMouseDown(index)
{
    setCurrentBoardStateByMoveIndex(index);
}

function controlsOpeningInput_onInput()
{
    populateOpeningSelect(document.getElementById("controls-opening-input").value);
}

function controlsOpeningSelect_onChange()
{
    var select = document.getElementById("controls-opening-select");
    var index = parseInt(select.value.split("_")[1]);
    var opening = _openings[index];

    selectOpening(opening);
}

function controlsPasteFENButton_onClick()
{
    async function pasteFEN()
    {
        const text = await navigator.clipboard.readText();
        if(text == null) return;
        if(text.length == 0) return;

        var validate = _chessJS.validate_fen(text);
        if(!validate.valid)
        {
            alert(`FEN string is invalid:\n"${validate.error}"`);
            return;
        }

        document.getElementById("controls-fen-input").value = text;

        reset();
        setCurrentBoardStateToFEN(text);

        if(_chessJS.turn() == 'b')
            _boardStateHistory.add(null, null, "");

        boardCanvasClear();
        resetMoveClocks();

        clearBoardHighlights();
        updateBoardSquaresTableFromBoardState(_currentBoardState);
        updateControlsFENInput();
        updateControlsMovesTable();
        updateGameDetailsMoveCommentTextArea();
    }

    pasteFEN();
}

function controlsRandomPuzzleButton_onClick()
{
    selectRandomPuzzle();
}

function controlsResetPuzzleButton_onClick()
{
    resetCurrentPuzzle();
}

function controlsStockfishSelect_onChange()
{
    var select = document.getElementById("controls-stockfish-select");

    _stockfishEnabled = select.selectedIndex - 1;

    if(_stockfishEnabled == 0 || (_stockfishEnabled == 1 && _chessJS.turn() == 'w') || (_stockfishEnabled == 2 && _chessJS.turn() == 'b'))
        stockfishUpdate();

    document.getElementById("controls-stockfish-message-span").style = (_stockfishEnabled > -1) ? "opacity: 1.0;" : "opacity: 0.3;";
}

function controlsTimeSelect_onChange()
{
    resetMoveClocks();
}

function getDetailsMoveCommentTextArea_onInput()
{
    var value = document.getElementById("controls-game-details-move-comment-text-area").value;
    _boardStateHistory.comments[_boardStateHistory.atIndex] = value;
}

function resetButton_onClick()
{
    reset();
}