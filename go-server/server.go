package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
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

func loadEngines() (map[string]string, string) {
	engines := make(map[string]string)
	files, _ := os.ReadDir("engines/bin")
	for _, f := range files {
		if !f.IsDir() {
			name := f.Name()
			engines[name] = "engines/bin/" + name
		}
	}
	defaultEngine := ""
	for k := range engines {
		defaultEngine = k
		break
	}
	return engines, defaultEngine
}

var engines, defaultEngine = loadEngines()

func executeEngine(fen, depth, engineName string) (string, error) {
	enginePath, ok := engines[engineName]
	if !ok {
		enginePath, ok = engines[defaultEngine]
		if !ok {
			return "", fmt.Errorf("no engines found")
		}
	}

	cmd := exec.Command(enginePath)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", err
	}

	if err := cmd.Start(); err != nil {
		return "", err
	}

	fmt.Fprintf(stdin, "uci\n")
	fmt.Fprintf(stdin, "position fen %s\n", fen)
	fmt.Fprintf(stdin, "go depth %s\n", depth)
	stdin.Close()

	scanner := bufio.NewScanner(stdout)
	var bestMove string
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "bestmove ") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				bestMove = parts[1]
				break
			}
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
		depth = "10"
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
