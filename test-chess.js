const Chess = require('chess.js').Chess;
const chess = new Chess();
console.log(chess.moves()); // Should print all legal moves

// Try an illegal move:
const move = chess.move({ from: "e2", to: "e5" }); // Pawn can't go 3 squares
console.log("Illegal pawn move result:", move); // should be null