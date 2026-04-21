package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
)

type EngineResponse struct {
	Fen    string `json:"fen"`
	Move   string `json:"move"`
	Turn   string `json:"turn"`
	Depth  int    `json:"depth"`
	Engine string `json:"engine"`
}

var engines = map[string]string{
	"komodo-201-64": "engines/bin/komodo-201-64",
}

var defaultEngine = "komodo-201-64"

func executeEngine(fen, depth, engineName string) (string, error) {
	enginePath, ok := engines[engineName]
	if !ok {
		enginePath = engines[defaultEngine]
	}

	cmd := exec.Command(enginePath)
	stdin, _ := cmd.StdinPipe()
	stdout, _ := cmd.StdoutPipe()
	cmd.Stderr = nil

	if err := cmd.Start(); err != nil {
		return "", err
	}

	fmt.Fprintf(stdin, "uci\nisready\n")
	fmt.Fprintf(stdin, "position fen %s\n", fen)
	fmt.Fprintf(stdin, "go depth %s\n", depth)
	fmt.Fprintf(stdin, "quit\n")
	stdin.Close()

	var bestMove string
	scanner := bufio.NewScanner(stdout)

	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		for i, f := range fields {
			if f == "bestmove" && i+1 < len(fields) {
				bestMove = fields[i+1]
				break
			}
		}
		if bestMove != "" {
			break
		}
	}

	cmd.Process.Kill()
	return bestMove, nil
}

func handler(w http.ResponseWriter, r *http.Request) {
	fen := r.URL.Query().Get("fen")
	if fen == "" {
		fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	}
	depth := r.URL.Query().Get("depth")
	if depth == "" {
		depth = "1"
	}
	engineName := r.URL.Query().Get("engine")
	if engineName == "" {
		engineName = defaultEngine
	}

	move, err := executeEngine(fen, depth, engineName)
	if err != nil {
		http.Error(w, err.Error(), 500)
		return
	}

	intDepth, _ := strconv.Atoi(depth)
	resp := EngineResponse{
		Fen:    fen,
		Move:   move,
		Turn:   "w",
		Depth:  intDepth,
		Engine: engineName,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/getBestMove", handler)
	http.HandleFunc("/engines", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"engines": engines,
			"default": defaultEngine,
		})
	})

	fmt.Println("Listening on port 5000")
	log.Fatal(http.ListenAndServe(":5000", nil))
}
