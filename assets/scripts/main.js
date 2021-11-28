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
var _boardOrientation = 0;
var _boardInAnimation = false;
var _currentPuzzle = null;
var _stockfishScoreEvaluation = 0;
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
var _boardThemes = 
[
    {
        name: "Blue",
        light: "rgb(234, 240, 215)", 
        dark: "rgb(73, 101, 147)",
        backgroundImage: ""
    },
    {
        name: "Brown",
        light: "rgb(240, 219, 174)", 
        dark: "rgb(193, 136, 93)",
        backgroundImage: ""
    },
    {
        name: "Green",
        light: "rgb(234, 244, 209)", 
        dark: "rgb(99, 166, 83)",
        backgroundImage: ""
    },
    {
        name: "Stone",
        light: "rgba(188, 179, 165, 0.5)", 
        dark: "rgba(38, 36, 39, 0.5)",
        backgroundImage: "assets/images/background-stone-0.png"
    },
    {
        name: "Wood",
        light: "rgba(188, 159, 115, 0.3)", 
        dark: "rgba(60, 26, 0, 0.35)",
        backgroundImage: "assets/images/background-wood-0.png"
    }
];
var _boardTheme = _boardThemes[1];
var _pieceset = "cburnett";
var _controlsVisible = true;
var _inFullscreen = false;
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
        this.startingFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    }

    add(move, boardState, comment, popRemaining)
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

            if(popRemaining)
            {
                while(this.moves.length > this.atIndex + 1)
                {
                    this.moves.pop();
                    this.states.pop();
                }
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
        this.startingFEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
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
        _boardInAnimation = true;

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

                _boardInAnimation = false;

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
        document.getElementsByTagName('body')[0].classList.remove("grabbing");

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
                var left = (_boardOrientation == 0) ? (rankAndFile.file * boardDivSquareSize) : ((7 - rankAndFile.file) * boardDivSquareSize);
                var top = (_boardOrientation == 0) ? (rankAndFile.rank * boardDivSquareSize) : ((7 - rankAndFile.rank) * boardDivSquareSize);
                boardDraggingPieceDiv.style.left =  left + "px";
                boardDraggingPieceDiv.style.top = top + "px";

                document.getElementsByTagName('body')[0].classList.add("grabbing");
            }
        }
        else
        {
            if(_currentSquareSelected == positionNotation)
                document.getElementById(`board-square-td-img_${positionNotation}`).src = getImageSourceForColorAndPiece(getColorAndPieceForPositionNotation(positionNotation));

            _currentSquareSelected = "";
            _currentSquareSelectedMoves = null;

            document.getElementsByTagName('body')[0].classList.remove("grabbing");
        }
    }
}

function buildBoardSquaresTable()
{
    var boardSquaresTable = document.getElementById("board-squares-table");
    var boardSquareSize = (document.getElementById("content").offsetHeight * 0.95) / 8;
    var innerHTML = "";
    var bgColorIndex = 0;

    for(var rank = 0; rank < 8; rank++)
    {
        innerHTML += "<tr>";
        for(var file = 0; file < 8; file++)
        {
            var bgColor = (bgColorIndex % 2 == 0) ? "rgb(240, 219, 174)" : "rgb(193, 136, 93)";
            var positionNotation = getPositionNotationForRankAndFile(rank, file);

            innerHTML += `<td id="board-square-td_${positionNotation}" style="width: ${boardSquareSize}; height: ${boardSquareSize}; background-color: ${bgColor}"><img id="board-square-td-img_${positionNotation}" class="board-square-td-img" src="assets/images/empty-0.png" width="${boardSquareSize}" height="${boardSquareSize}" onmousedown="boardSquare_onMouseDown(event, '${positionNotation}')" onmouseup="boardSquare_onMouseUp(event, '${positionNotation}')" /></td>`;
            
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
    updateBoardFromBoardState(_currentBoardState);
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

    var span1 = (turn == 0) ? document.getElementById("controls-time-white-span") : document.getElementById("controls-time-black-span");
    var span2 = (turn == 0) ? document.getElementById("side-time-white-span") : document.getElementById("side-time-black-span");

    var textContentParts = span1.textContent.split(":");
    var minutes = parseInt(textContentParts[0]);
    var seconds = parseInt(textContentParts[1]);

    if(minutes == 0 && seconds == 0) return;

    seconds--;

    if(seconds < 0)
    {
        minutes--;
        seconds = 59;
    }

    span1.textContent = `${minutes}:${seconds}`;
    span2.textContent = `${minutes}:${seconds}`;
}

function getBoardSquareCenterPosition(moveEventClientPosition)
{
    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    var x = 0;
    var y = 0;

    if(_boardOrientation == 0)
    {
        x = (Math.floor(((moveEventClientPosition.x - boardDivRect.left) / boardDivSize) * 8) * boardDivSquareSize) + (boardDivSquareSize / 2);
        y = (Math.floor(((moveEventClientPosition.y - boardDivRect.top) / boardDivSize) * 8) * boardDivSquareSize) + (boardDivSquareSize / 2);
    }
    else
    {
        x = (Math.floor(((boardDivSize - (moveEventClientPosition.x - boardDivRect.left)) / boardDivSize) * 8) * boardDivSquareSize) + (boardDivSquareSize / 2);
        y = (Math.floor(((boardDivSize - (moveEventClientPosition.y - boardDivRect.top)) / boardDivSize) * 8) * boardDivSquareSize) + (boardDivSquareSize / 2);
    }

    return { x: x, y: y };
}

function getBoardSquarePositionForPositionNotation(notation)
{
    var rankFile = getRankAndFileForPositionNotation(notation);

    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    if(_boardOrientation == 0)
        return { x: rankFile.file * boardDivSquareSize, y: rankFile.rank * boardDivSquareSize };
    else
        return { x: (7 - rankFile.file) * boardDivSquareSize, y: (7 - rankFile.rank) * boardDivSquareSize };
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

    if(piece == 'p') src += `${_pieceset}-pawn-`;
    if(piece == 'n') src += `${_pieceset}-knight-`;
    if(piece == 'b') src += `${_pieceset}-bishop-`;
    if(piece == 'r') src += `${_pieceset}-rook-`;
    if(piece == 'q') src += `${_pieceset}-queen-`;
    if(piece == 'k') src += `${_pieceset}-king-`;

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

function getPositionForBoardDraggingPieceDivFromMouseEvent(mouseEvent)
{
    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    var left = (_controlsVisible) ? (mouseEvent.clientX - ((boardDivSquareSize / 2) + boardDivRect.left)) : (mouseEvent.clientX - (boardDivRect.left + (boardDivSquareSize / 2)));
    var top = mouseEvent.clientY - boardDivSquareSize + boardDivRect.top;

    return { x: left, y: top };
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

function getPositionNotationForRealBoardPosition(position)
{
    var boardDiv = document.getElementById("board-div");
    var boardDivRect = boardDiv.getBoundingClientRect();
    var boardDivSize = (boardDivRect.right - boardDivRect.left);
    var boardDivSquareSize = boardDivSize / 8;

    for(var rank = 0; rank < 9; rank++)
    {
        for(var file = 0; file < 9; file++)
        {
            if(position.x < file * boardDivSquareSize && position.y < rank * boardDivSquareSize)
                return getPositionNotationForRankAndFile(rank - 1, file - 1);
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

            _boardStateHistory.add(move, boardState, comment, false);
            _boardStateHistoryLoadedGame.add(move, boardState, comment, false);
        }

        _currentBoardState = new BoardState(chessJSAlt.fen);

        updateBoardFromBoardState(_currentBoardState);
        updateControlsFENInput();
        updateControlsMovesTable();
        updateGameDetailsMoveCommentTextArea();
        updateControlsOpeningDiv();

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

        var popRemaining = true;
        if(_boardStateHistoryLoadedGame != null)
        {   
            var moveOther = _boardStateHistoryLoadedGame.moves[_boardStateHistory.atIndex];
            if(moveOther != null)
            {
                if(move.san == moveOther.san) popRemaining = false;
            }
        }
        _boardStateHistory.add(move, _currentBoardState, _chessJS.get_comment(), popRemaining);

        playSoundForMove(move);

        if(_stockfishEnabled > -1 && !_chessJS.in_checkmate()) 
            stockfishUpdate(move);

        if(_chessJS.in_check() || _chessJS.in_checkmate())
        {
            var value = (_chessJS.turn() == 'w') ? 'K' : 'k';
            var highlight = (_chessJS.in_check()) ? "check" : "checkmate";
            setBoardHighlight(getPositionNotationForBoardSquareValue(value), highlight);
        }

        updateBoardFromBoardState(_currentBoardState);
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

function positionControlsDiv()
{
    /*
    var content = document.getElementById("content");
    var contentDivRect = content.getBoundingClientRect();
    var contentDivSize = contentDivRect.right - contentDivRect.left;
    var controlsDiv = document.getElementById("controls-div");
    var controlsDivRect = controlsDiv.getBoundingClientRect();
    var controlsDivSize = controlsDivRect.right - controlsDivRect.left;
    controlsDiv.style.left = (contentDivSize - (controlsDivSize + 10)) + "px";
    */

    var boardDiv = document.getElementById("board-div");
    var content = document.getElementById("content");
    var controlsDiv = document.getElementById("controls-div");
    var left = boardDiv.offsetLeft + boardDiv.offsetWidth + 25;
    while(left + controlsDiv.offsetWidth > content.offsetWidth)
        left--;
    controlsDiv.style.left = left + "px";
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
    updateBoardFromBoardState(_currentBoardState);
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
        _boardStateHistory.add(null, null, "", false);

    boardCanvasClear();
    resetMoveClocks();

    clearBoardHighlights();
    updateBoardFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateGameDetailsMoveCommentTextArea();

    document.getElementById("controls-reset-puzzle-button").disabled = false;
}

function resetLoadedGame()
{
    if(_boardStateHistoryLoadedGame == null) return;

    var atIndex = _boardStateHistory.atIndex;
    if(atIndex > _boardStateHistoryLoadedGame.moves.length)
        atIndex = _boardStateHistoryLoadedGame.moves.length - 1;

    var divergenceAt = -1;
    for(var i = 0; i < Math.max(_boardStateHistory.moves.length, _boardStateHistoryLoadedGame.moves.length); i++)
    {
        for(var j = i; j < i + 2; j++)
        {
            var moveBSH = _boardStateHistory.moves[j];
            var moveBSHLG = _boardStateHistoryLoadedGame.moves[j];
            
            if(moveBSH != null && moveBSHLG != null && moveBSH.san != moveBSHLG.san)
            {
                divergenceAt = j;
                break;
            }
        }
        i++;

        if(divergenceAt != -1) break;
    }

    if(divergenceAt != -1) 
        atIndex = divergenceAt;
    else 
        atIndex = 0;

    _boardStateHistory.clear();
    for(var i = 0; i < _boardStateHistoryLoadedGame.moves.length; i++)
        _boardStateHistory.add(_boardStateHistoryLoadedGame.moves[i], _boardStateHistoryLoadedGame.states[i], _boardStateHistoryLoadedGame.comments[i], false);

    setCurrentBoardStateByMoveIndex(atIndex - 1);
}

function resetMoveClocks()
{
    var select = document.getElementById("controls-time-select");

    var timeSpans = 
    [
        document.getElementById("controls-time-white-span"),
        document.getElementById("controls-time-black-span"),
        document.getElementById("side-time-white-span"),
        document.getElementById("side-time-black-span")
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

    for(var i = 0; i < 4; i++)
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

    for(var i = 0; i < opening.movesNotation.length; i++)
    {
        _chessJS.move(opening.movesNotation[i]);
        setCurrentBoardStateToChessJSBoard();
        var history = _chessJS.history({ verbose: true });
        var move = history[history.length - 1];
        _boardStateHistory.add(move, _currentBoardState, "", false);
    }

    updateBoardFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateControlsOpeningDiv();

    document.getElementById("controls-game-button-first-move").disabled = false;
    document.getElementById("controls-game-button-previous-move").disabled = false;
    document.getElementById("controls-game-button-next-move").disabled = false;
    document.getElementById("controls-game-button-last-move").disabled = false;
    document.getElementById("controls-game-button-save").disabled = false;
}

function selectRandomPuzzle()
{
    reset();

    var puzzle = getRandomPuzzle();
    _currentPuzzle = puzzle;

    setCurrentBoardStateToFEN(_currentPuzzle.FEN);
    _boardStateHistory.startingFEN = _currentPuzzle.FEN;

    if(_currentPuzzle.instructions.toLowerCase().includes("black"))
        _boardStateHistory.add(null, _currentBoardState, "", false);

    updateBoardFromBoardState(_currentBoardState);
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
    updateBoardFromBoardState(_currentBoardState);
}

function setCurrentBoardStateByMoveIndex(moveIndex)
{
    var state = _boardStateHistory.states[moveIndex];
    var FEN = "";

    if(state == null)
    {
        if(_currentPuzzle != null)
        {
            resetCurrentPuzzle();
            return;
        }
        else
        {
            FEN = _boardStateHistory.startingFEN;
            _boardStateHistory.atIndex = 0;
        }
    }
    else
    {
        FEN = state.fen;
        _boardStateHistory.atIndex = moveIndex + 1;
    }

    _currentSquareSelected = "";

    setCurrentBoardStateToFEN(FEN);

    boardCanvasClear();
    clearBoardHighlights();
    updateBoardFromBoardState(_currentBoardState);
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
    positionControlsDiv();

    setupChessJS();
    setCurrentBoardStateToChessJSBoard();
    _boardStateHistory = new BoardStateHistory();

    stockfishPostMessage("uci");

    loadOpenings();
    loadPuzzles();

    updateBoardFromBoardState(_currentBoardState);
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

    var stockfishScore = (_stockfishScoreEvaluation / 1000.0);
    if(stockfishScore >= 0.0) stockfishScore = "+" + stockfishScore;

    if(_stockfishEnabled == 0)
    {
        var move = getMoveForNotation(moveAsFromTo);
        var moveValue = (move == null) ? moveAsFromTo : move.san;

        stockfishUpdateMessage(`Best move: "${moveValue}" (Score: ${stockfishScore})`);
        
        return;
    }

    stockfishUpdateMessage("Ready.");

    if(((_chessJS.turn() == 'w' && _stockfishEnabled == 1) || (_chessJS.turn() == 'b' && _stockfishEnabled == 2)))
    {
        stockfishUpdateMessage("Moving...");
        makeMoveFromCurrentBoardStateFromTo(moveAsFromTo);
    }
}

function stockfishSetOption(option, value)
{
    if(!_stockfishIsReady) return;

    if(option == "Skill Level")
    {
        var valueInt = Math.min(Math.max(parseInt(value), 0), 20);
        value = valueInt;
    }

    stockfishPostMessage(`setoption name "${option}" value ${value}`);
}

function stockfishPostMessage(message) 
{
    console.log(`stockfishPostMessage: "${message}"`);

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

    if(parts[0] == "info")
    {
        for(var i = 0; i < parts.length; i++)
        {
            if(parts[i] == "cp")
            {
                _stockfishScoreEvaluation = parseInt(parts[i + 1])
                continue;
            }
        }
    }

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

function updateBoardFromBoardState(boardState)
{
    var boardDiv = document.getElementById("board-div");
    boardDiv.style.background = "rgba(255, 255, 255, 0)";
    boardDiv.style.backgroundImage = (_boardTheme.backgroundImage != "") ? `url(${_boardTheme.backgroundImage})` : "none";

    var bgColorIndex = 0;

    for(var rank = 0; rank < 8; rank++)
    {
        for(var file = 0; file < 8; file++)
        {
            var squareIndex = ((rank * 8) + file);
            var squareValue = boardState.squares[squareIndex];
            var positionNotation = getPositionNotationForRankAndFile(rank, file);
            var boardSquareTD = document.getElementById(`board-square-td_${positionNotation}`);
            var boardSquareTDImg = document.getElementById(`board-square-td-img_${positionNotation}`);
            var bgColor = (bgColorIndex % 2 == 0) ? _boardTheme.light : _boardTheme.dark;

            boardSquareTD.style.backgroundColor = bgColor;
            boardSquareTDImg.style.cursor = "default";
            boardSquareTDImg.style.transform = (_boardOrientation == 0) ? "scale(1, 1)" : "scale(-1, -1)";

            for(var i = 0; i < _boardHighlights.length; i++)
            {
                if(_boardHighlights[i].position == positionNotation)
                {
                    var bgColorHighlight = "white";
                    if(_boardTheme.backgroundImage != "")
                    {
                        if(_boardHighlights[i].highlight == "check")
                            bgColorHighlight = "rgba(255, 100, 100, 0.5)";
                        if(_boardHighlights[i].highlight == "checkmate")
                            bgColorHighlight = "rgba(255, 0, 0, 0.75)";
                        if(_boardHighlights[i].highlight == "from")
                            bgColorHighlight = "rgba(210, 210, 0, 0.5)";
                        if(_boardHighlights[i].highlight == "to")
                            bgColorHighlight = "rgba(225, 225, 0, 0.5)";
                    }
                    else
                    {
                        if(_boardHighlights[i].highlight == "check")
                            bgColorHighlight = "rgb(255, 100, 100)";
                        if(_boardHighlights[i].highlight == "checkmate")
                            bgColorHighlight = "rgb(255, 0, 0)";
                        if(_boardHighlights[i].highlight == "from")
                            bgColorHighlight = "rgb(210, 210, 0)";
                        if(_boardHighlights[i].highlight == "to")
                            bgColorHighlight = "rgb(225, 225, 0)";
                    }

                    boardSquareTD.style.backgroundColor = bgColorHighlight;
                    break;
                }
            }

            if(squareValue == "") boardSquareTDImg.src = "assets/images/empty-0.png";
            if(squareValue == "P") boardSquareTDImg.src = `assets/images/${_pieceset}-pawn-0.png`;
            if(squareValue == "N") boardSquareTDImg.src = `assets/images/${_pieceset}-knight-0.png`;
            if(squareValue == "B") boardSquareTDImg.src = `assets/images/${_pieceset}-bishop-0.png`;
            if(squareValue == "R") boardSquareTDImg.src = `assets/images/${_pieceset}-rook-0.png`;
            if(squareValue == "Q") boardSquareTDImg.src = `assets/images/${_pieceset}-queen-0.png`;
            if(squareValue == "K") boardSquareTDImg.src = `assets/images/${_pieceset}-king-0.png`;
            if(squareValue == "p") boardSquareTDImg.src = `assets/images/${_pieceset}-pawn-1.png`;
            if(squareValue == "n") boardSquareTDImg.src = `assets/images/${_pieceset}-knight-1.png`;
            if(squareValue == "b") boardSquareTDImg.src = `assets/images/${_pieceset}-bishop-1.png`;
            if(squareValue == "r") boardSquareTDImg.src = `assets/images/${_pieceset}-rook-1.png`;
            if(squareValue == "q") boardSquareTDImg.src = `assets/images/${_pieceset}-queen-1.png`;
            if(squareValue == "k") boardSquareTDImg.src = `assets/images/${_pieceset}-king-1.png`;

            if(squareValue != "")
            {
                if(_chessJS.turn() == 'w')
                {
                    if(squareValue.toLowerCase() != squareValue)
                        boardSquareTDImg.style.cursor = "grab";
                    else
                        boardSquareTDImg.style.cursor = "default";
                }
                else
                {
                    if(squareValue.toLowerCase() == squareValue)
                        boardSquareTDImg.style.cursor = "grab";
                    else
                        boardSquareTDImg.style.cursor = "default";
                }
            }

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
                var backgroundColor = "white";

                if(moveBSH != null)
                {
                    san = moveBSH.san;

                    if(moveBSHLG == null) 
                        divergenceFound = true;
                    else
                    {
                        if(moveBSH.san != moveBSHLG.san)
                            divergenceFound = true;
                    }

                    if(j == _boardStateHistory.atIndex - 1)
                        backgroundColor = (divergenceFound) ? "rgb(255,204,204)" : "rgb(224,224,224)";
                }
                else
                {
                    san = moveBSHLG.san;
                    if(j == _boardStateHistoryLoadedGame.atIndex - 1)
                        backgroundColor = "rgb(224,224,224)";
                }

                var foregroundColor = (divergenceFound) ? "red" : "black";
                
                innerHTML += `<td id="controls-game-moves-table-td_${j}" class="controls-game-moves-table-cell" style="color: ${foregroundColor} ; background-color: ${backgroundColor}" onmousedown="controlsGamesMovesTableCell_onMouseDown(${j})">${san}</td>`;

                if(moveBSH != null && moveBSHLG != null && moveBSH.san != moveBSHLG.san)
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

function updateControlsOpeningDiv(movesNotation)
{
    if(movesNotation == null) movesNotation = _chessJS.history();
    var controlsOpeningDiv = document.getElementById("controls-opening-div");

    if(movesNotation.length == 0)
    {
        controlsOpeningDiv.innerHTML = "...";
        return;
    }

    var opening = getOpeningWithMoves(movesNotation);
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

    var position = getPositionForBoardDraggingPieceDivFromMouseEvent(mouseEvent);

    var boardDraggingPieceDiv = document.getElementById("board-dragging-piece-div");
    boardDraggingPieceDiv.style.left = position.x + "px";
    boardDraggingPieceDiv.style.top = position.y + "px";
}

function boardDiv_onMouseUp(mouseEvent)
{
    var mousePosition = { x: mouseEvent.clientX, y: mouseEvent.clientY };

    /*if(mouseEvent.button == 0 && _currentSquareSelected != "")
    {
        var positionNotation = getPositionNotationForRealBoardPosition(mousePosition);
        boardSquareSelected(positionNotation, "up");

        return;
    }
    */

    if(mouseEvent.button != 2 || _rightMouseDragFrom == null) return;

    var to = getBoardSquareCenterPosition(mousePosition);
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
}

function body_onKeyDown(keyboardEvent)
{
    var activeElementID = document.activeElement.id;
    if(activeElementID.includes("input") || activeElementID.includes("select")) 
        return;
    
    var keyCode = keyboardEvent.keyCode;
    
    if(keyCode == 37 && !document.getElementById("controls-game-button-previous-move").disabled)
    {
        controlsGameButton_onClick("previous");
        return;
    }

    if(keyCode == 39 && !document.getElementById("controls-game-button-next-move").disabled)
    {
        controlsGameButton_onClick("next");
        return;
    }
}

function body_onLoad()
{
    setup();
}

function controlsBoardThemeSelect_onChange()
{
    var select = document.getElementById("controls-board-theme-select");
    var index = select.selectedIndex;

    _boardTheme = _boardThemes[index];

    updateBoardFromBoardState(_currentBoardState);
}

function controlsGameButton_onClick(descriptor)
{
    if(descriptor == "to-start")
    {
        if(_boardInAnimation) return;

        setCurrentBoardStateByMoveIndex(-1);
        return;
    }

    if(descriptor == "previous")
    {
        if(_boardInAnimation) return;

        _boardStateHistory.atIndex = Math.max(_boardStateHistory.atIndex - 2, -1);

        setCurrentBoardStateByMoveIndex(_boardStateHistory.atIndex);
        return;
    }

    if(descriptor == "next")
    {
        if(_boardInAnimation) return;

        _boardStateHistory.atIndex = Math.min(_boardStateHistory.atIndex, _boardStateHistory.moves.length - 1);
        
        var move = _boardStateHistory.moves[_boardStateHistory.atIndex];
        if(move == null)
        {
            _boardStateHistory.atIndex++;
            move = _boardStateHistory.moves[_boardStateHistory.atIndex];
        }

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
        if(_boardInAnimation) return;
        
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
        resetLoadedGame();

        return;
    }
}

function controlsGamesMovesTableCell_onMouseDown(index)
{
    setCurrentBoardStateByMoveIndex(index);

    if(index == 0) return;

    var move = _boardStateHistory.moves[index];

    setBoardHighlight(move.from, "from");
    setBoardHighlight(move.to, "to");

    animateMove(move, () => 
        { 
            playSoundForMove(move);
        });
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
        const FEN = await navigator.clipboard.readText();
        if(FEN == null) return;
        if(FEN.length == 0) return;

        var validate = _chessJS.validate_fen(FEN);
        if(!validate.valid)
        {
            alert(`FEN string is invalid:\n"${validate.error}"`);
            return;
        }

        document.getElementById("controls-fen-input").value = FEN;

        reset();
        setCurrentBoardStateToFEN(FEN);
        _boardStateHistory.startingFEN = FEN;

        if(_chessJS.turn() == 'b')
            _boardStateHistory.add(null, _currentBoardState, "", false);

        boardCanvasClear();
        resetMoveClocks();

        clearBoardHighlights();
        updateBoardFromBoardState(_currentBoardState);
        updateControlsFENInput();
        updateControlsMovesTable();
        updateGameDetailsMoveCommentTextArea();
    }

    pasteFEN();
}

function controlsPiecesetSelect_onChange()
{
    var select = document.getElementById("controls-pieceset-select");
    var index = select.selectedIndex;

    _pieceset = select.value;

    updateBoardFromBoardState(_currentBoardState);
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

function controlsStockfishSkillLevelSelect_onChange()
{
    var select = document.getElementById("controls-stockfish-skill-level-select");

    stockfishSetOption("Skill Level", select.value);
}

function controlsTimeSelect_onChange()
{
    resetMoveClocks();
}

function flipBoardButton_onClick()
{
    _boardOrientation = (_boardOrientation == 0) ? 1 : 0;

    document.getElementById("board-squares-table").style.transform = (_boardOrientation == 0) ? "scale(1, 1)" : "scale(-1, -1)";
    document.getElementById("board-canvas").style.transform = (_boardOrientation == 0) ? "scale(1, 1)" : "scale(-1, -1)";

    updateBoardFromBoardState(_currentBoardState);
}

function getDetailsMoveCommentTextArea_onInput()
{
    var value = document.getElementById("controls-game-details-move-comment-text-area").value;
    _boardStateHistory.comments[_boardStateHistory.atIndex] = value;
}

function hideControlsButton_onClick()
{
    _controlsVisible = false;
    document.getElementById("controls-div").style.display = "none";

    var boardDiv = document.getElementById("board-div");
    var content = document.getElementById("content");
    boardDiv.style.transform = `translateX(${((content.offsetWidth / 2) - (boardDiv.offsetWidth / 2))}px)`;

    document.getElementById("show-controls-button").style.display = "block";
    document.getElementById("side-time-div").style.display = "block";
}

function resetButton_onClick()
{
    reset();
}

function showControlsButton_onClick()
{
    _controlsVisible = true;
    document.getElementById("controls-div").style.display = "block";

    var boardDiv = document.getElementById("board-div");
    var content = document.getElementById("content");
    boardDiv.style.transform = "";

    document.getElementById("show-controls-button").style.display = "none";
    document.getElementById("side-time-div").style.display = "none";
}