var _chessJS = new Chess();

const _stockfish = STOCKFISH();

stockfish.onmessage = function (event) {
	stockfishReceiveData(event.data ? event.data : event);
};

var _currentBoardState = null;
var _currentSquareSelected = "";
var _currentSquareSelectedMoves = null;
var _boardStateHistory = null;
var _currentPuzzle = null;

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
        this.moves = [];
        this.states = [];
    }

    add(move, boardState)
    {
        if(this.atIndex == this.moves.length)
        {
            this.moves.push(move);
            this.states.push(boardState);
        }
        else
        {
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

function boardSquareSelected(positionNotation)
{
    var rank = 8 - parseInt(positionNotation[1]);
    var file = positionNotation.charCodeAt(0) - 'a'.charCodeAt(0);
    var index = (rank * 8) + file;
    var squareValue = _currentBoardState.squares[index];

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

    if(_currentSquareSelected != "")
    {
        for(var i = 0; i < _currentSquareSelectedMoves.length; i++)
        {
            var move = _currentSquareSelectedMoves[i];
            if(move.to == positionNotation)
            {
                makeMoveFromCurrentBoardState(move);
                return;
            }
        }
    }
    
    if(squareValue != "")
    {
        _currentSquareSelected = positionNotation;
        _currentSquareSelectedMoves = _chessJS.moves({ square: positionNotation, verbose: true });
    }
}

function buildBoardSquaresTable()
{
    var boardSquaresTable = document.getElementById("board-squares-table");
    var innerHTML = "";
    var colorIndex = 0;

    for(var rank = 0; rank < 8; rank++)
    {
        innerHTML += "<tr>";
        for(var file = 0; file < 8; file++)
        {
            var bgColor = (colorIndex % 2 == 0) ? "rgb(240, 219, 174)" : "rgb(193, 136, 93)";
            var positionNotation = positionNotationForRankAndFile(rank, file);

            innerHTML += `<td class="board-square-td" style="background-color: ${bgColor}"><img id="board-square-td-img_${positionNotation}" src="assets/images/empty-0.png" width=90 height=90 onmousedown="boardSquare_onMouseDown('${positionNotation}')" /></td>`;
            
            colorIndex++;
        }
        innerHTML += "</tr>";
        colorIndex++;
    }

    boardSquaresTable.innerHTML = innerHTML;
}

function loadGame()
{
	var element = document.getElementById("loadGameInput");

	var files = element.files;

	if (files.length == 0) return;

	var fileReader = new FileReader();

	fileReader.onload = (e) => 
	{
        var fileContent = e.target.result;

		_chessJS.load_pgn(fileContent);
        _boardStateHistory.clear();

        chessJSAlt = new Chess();
        chessJSAlt.load("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

        var history = _chessJS.history({ verbose: true });
        for(var i = 0; i < history.length; i++)
        {
            var move = history[i];
            chessJSAlt.move(move.san);

            var boardState = new BoardState(chessJSAlt.fen());
            _boardStateHistory.add(move, boardState);

            updateControlsOpeningDiv(chessJSAlt.history());
        }

        _currentBoardState = new BoardState(chessJSAlt.fen);

        updateBoardSquaresTableFromBoardState(_currentBoardState);
        updateControlsFENInput();
        updateControlsMovesTable();

        var pgn = _chessJS.pgn();
        alert(pgn);
        pgn = pgn.replaceAll("[", "").replaceAll("]", "");
        var pgnLines = pgn.split("\n");
        for(var i = 0; i < pgnLines.length; i++)
        {
            var pgnLineParts = pgnLines[i].split("\"");
            var key = pgnLineParts[0].trim().toLowerCase();
            var value = pgnLineParts[1].trim();

            var input = document.getElementById(`controls-game-details-${key}-input`);
            if(input == null) continue;

            input.value = value;
        }
	};

	fileReader.onerror = (e) => alert(`Could not load file "${e.target.error.name}".`);

	fileReader.readAsText(files[0]);
}

function makeMoveFromCurrentBoardState(move)
{
    _chessJS.move(move.san);
    setCurrentBoardStateToChessJSBoard();
    _currentSquareSelected = "";
    _boardStateHistory.add(move, _currentBoardState);

    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateControlsOpeningDiv();

    console.log(`Move: ${move.san}`);
}

function positionNotationForRankAndFile(rank, file)
{
    var fileLetters = [ "a", "b", "c", "d", "e", "f", "g", "h" ];

    return fileLetters[file] + (8 - rank);
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
    _currentSquareSelected = "";
    _currentPuzzle = null;

    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateControlsOpeningDiv();
    updateControlsPuzzleDiv();

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

    document.getElementById("controls-game-details-event-notes-text-area").innerHTML = "...";
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
        _boardStateHistory.add(null, null);

    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();

    document.getElementById("controls-reset-puzzle-button").disabled = false;
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
        _boardStateHistory.add(move, _currentBoardState);
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
        _boardStateHistory.add(null, null);

    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
    updateControlsOpeningDiv();
    updateControlsPuzzleDiv();

    document.getElementById("controls-reset-puzzle-button").disabled = false;
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

    updateBoardSquaresTableFromBoardState(_currentBoardState);
    updateControlsFENInput();
    updateControlsMovesTable();
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
}

function setupChessJS()
{
    _chessJS.load("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
}

function stockfishBestMoveDecided(moveAsFromTo) 
{
    alert(moveAsFromTo);
    return;

	if (stockfishEnabledAsPlayer) 
    {
		if (playerPlayAs == turn)
			return;

		var from = moveAsFromTo.substr(0, 2);
		var piece = GetPieceAtPosition(from);

		Move(piece, moveAsFromTo);

		stockfishUpdateMessage("Moving...");
	}
}

function stockfishPostMessage(message) 
{
	stockfish.postMessage(message);
}

function stockfishReceiveData(data) 
{
	console.log("StockfishReceiveData: '" + data + "'");

	if (!stockfishIsReady) {
		if (data == "uciok") {
			stockfishIsReady = true;

			stockfishUpdateMessage("Ready.");
		}

		return;
	}

	var parts = data.split(" ");

	if (parts[0] == "bestmove")
		stockfishBestMoveDecided(parts[1]);

	stockfishUpdateMessage("Ready.");
}

function stockfishUpdate(move) 
{
	if (!stockfishIsReady) return;

	if (moveObject != null) 
    {
		var notation = move.from + move.to;

		stockfishPostMessage("position fen " + chess.fen() + " moves " + notation);
	}
	else
        stockfishPostMessage("position fen " + chess.fen());

	stockfishPostMessage("go depth 1");

	stockfishUpdateMessage("Thinking...");
}

function stockfishUpdateMessage(message)
{
    alert("Stockfish: " + message);
}

function updateBoardSquaresTableFromBoardState(boardState)
{
    var boardSquaresTable = document.getElementById("board-squares-table");
    var squareIndex = 0;

    for(var rank = 0; rank < 8; rank++)
    {
        for(var file = 0; file < 8; file++)
        {
            var squareValue = boardState.squares[squareIndex];
            var positionNotation = positionNotationForRankAndFile(rank, file);
            var boardSquareTDImg = document.getElementById("board-square-td-img_" + positionNotation);

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

            squareIndex++;
        }
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

    for(var i = 0; i < _boardStateHistory.moves.length; i++)
    {
        innerHTML += `<tr><td>${(i / 2) + 1}. </td>`;
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

function body_onLoad()
{
    setup();
}

function boardSquare_onMouseDown(positionNotation)
{
    boardSquareSelected(positionNotation);
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
        setCurrentBoardStateByMoveIndex(_boardStateHistory.atIndex);
        return;
    }

    if(descriptor == "to-end")
    {
        setCurrentBoardStateByMoveIndex(_boardStateHistory.moves.length - 1);
        return;
    }

    if(descriptor == "load")
    {
        document.getElementById("loadGameInput").click();
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

function controlsRandomPuzzleButton_onClick()
{
    selectRandomPuzzle();
}

function controlsResetPuzzleButton_onClick()
{
    resetCurrentPuzzle();
}

function resetButton_onClick()
{
    reset();
}