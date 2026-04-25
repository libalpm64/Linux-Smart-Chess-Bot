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
	Fen    string     `json:"fen"`
	Lines  []MoveLine `json:"lines"`
	Turn   string     `json:"turn"`
	Depth  int        `json:"depth"`
	Engine string     `json:"engine"`
}

type MoveLine struct {
	Moves     []string `json:"moves"`
	Score     int      `json:"score"`
	ScoreType string   `json:"scoreType"`
	Depth     int      `json:"depth"`
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

func executeEngine(fen, depth, engineName string) ([]MoveLine, error) {
	enginePath, ok := engines[engineName]
	if !ok {
		enginePath, ok = engines[defaultEngine]
		if !ok {
			return nil, fmt.Errorf("no engines found")
		}
	}

	cmd := exec.Command(enginePath)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	// Send UCI commands
	fmt.Fprintf(stdin, "uci\n")
	scanner := bufio.NewScanner(stdout)
	
	// Wait for uciok
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "uciok") {
			break
		}
	}

	// Set position and go
	fmt.Fprintf(stdin, "position fen %s\n", fen)
	fmt.Fprintf(stdin, "go depth %s\n", depth)
	
	// Read output and find best move and score
	var bestMove string
	var bestScore int = 0
	var scoreType string = "cp"
	
	for scanner.Scan() {
		line := scanner.Text()
		
		if strings.HasPrefix(line, "bestmove") {
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				bestMove = parts[1]
			}
			break
		}
		
		// Parse score from info lines
		if strings.HasPrefix(line, "info") && strings.Contains(line, "score") {
			fields := strings.Fields(line)
			for i, field := range fields {
				if field == "score" && i+2 < len(fields) {
					if fields[i+1] == "cp" {
						score, _ := strconv.Atoi(fields[i+2])
						bestScore = score
						scoreType = "cp"
					} else if fields[i+1] == "mate" {
						score, _ := strconv.Atoi(fields[i+2])
						bestScore = score
						scoreType = "mate"
					}
					break
				}
			}
		}
	}
	
	cmd.Process.Kill()
	
	if bestMove == "" {
		return nil, fmt.Errorf("no moves found")
	}
	
	// Return the best move with score
	lines := []MoveLine{
		{
			Moves:     []string{bestMove},
			Score:     bestScore,
			ScoreType: scoreType,
			Depth:     14,
		},
	}
	
	return lines, nil
}

func handler(w http.ResponseWriter, r *http.Request) {
	fen := r.URL.Query().Get("fen")
	if fen == "" {
		fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
	}
	depth := r.URL.Query().Get("depth")
	if depth == "" {
		depth = "14"
	}
	engineName := r.URL.Query().Get("engine")
	if engineName == "" {
		engineName = defaultEngine
	}

	log.Printf("Request: %s", fen[:min(30, len(fen))]+"...")

	lines, err := executeEngine(fen, depth, engineName)
	if err != nil {
		log.Printf("Error: %v", err)
		http.Error(w, err.Error(), 500)
		return
	}

	intDepth, _ := strconv.Atoi(depth)
	resp := EngineResponse{
		Fen:    fen,
		Lines:  lines,
		Turn:   strings.Split(fen, " ")[1],
		Depth:  intDepth,
		Engine: engineName,
	}

	if len(lines) > 0 && len(lines[0].Moves) > 0 {
		log.Printf("Best move: %s, Score: %d %s", lines[0].Moves[0], lines[0].Score, lines[0].ScoreType)
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	json.NewEncoder(w).Encode(resp)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	http.HandleFunc("/getBestMove", handler)
	http.HandleFunc("/engines", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"engines": engines,
			"default": defaultEngine,
		})
	})

	fmt.Println("Chess server listening on port 5000")
	log.Fatal(http.ListenAndServe(":5000", nil))
}